#!/usr/bin/env node
import path from 'node:path';
import {
  buildCursorMcpConfig,
  cursorMcpPath,
  evaluateServerRequirements,
  getProfileDefinition,
  loadEnvFromFiles,
  loadProfilesConfig,
  loadRequirementsConfig,
  mcpStatePath,
  normalizeServerEntry,
  nowIso,
  readJsonIfExists,
  writeJsonFile,
} from '../mcp/lib/mcp-core.mjs';

function usage() {
  console.log(`
Usage:
  node tools/scripts/mcp-profile.mjs list
  node tools/scripts/mcp-profile.mjs status
  node tools/scripts/mcp-profile.mjs activate <profile> [--no-optional|--with-optional|--force-optional]
  node tools/scripts/mcp-profile.mjs deactivate
  node tools/scripts/mcp-profile.mjs reset
`);
}

function parseArgs(argv) {
  const positionals = [];
  const flags = new Set();

  for (const token of argv) {
    if (token.startsWith('--')) {
      flags.add(token);
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags };
}

function pickOptionalMode(flags) {
  if (flags.has('--force-optional')) {
    return 'force';
  }
  if (flags.has('--no-optional')) {
    return 'none';
  }
  return 'auto';
}

function uniqueServerIds(entries) {
  return Array.from(new Set(entries.map((entry) => entry.id)));
}

function inferProfileFromServers(profilesConfig, activeServerIds) {
  const active = new Set(activeServerIds);
  const candidates = [];

  for (const [profileName, profileDef] of Object.entries(profilesConfig.profiles ?? {})) {
    const requiredEntries = Array.isArray(profileDef.servers)
      ? profileDef.servers.map(normalizeServerEntry)
      : [];
    const optionalEntries = Array.isArray(profileDef.optionalServers)
      ? profileDef.optionalServers.map(normalizeServerEntry)
      : [];

    const requiredIds = uniqueServerIds(requiredEntries);
    const optionalIds = uniqueServerIds(optionalEntries);
    const allowed = new Set([...requiredIds, ...optionalIds]);

    const hasAllRequired = requiredIds.every((id) => active.has(id));
    const hasOnlyAllowed = activeServerIds.every((id) => allowed.has(id));

    if (hasAllRequired && hasOnlyAllowed) {
      candidates.push(profileName);
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
}

function summarizeServerSet(profilesConfig, profileName) {
  const profile = getProfileDefinition(profilesConfig, profileName);
  const requiredEntries = Array.isArray(profile.servers) ? profile.servers.map(normalizeServerEntry) : [];
  const optionalEntries = Array.isArray(profile.optionalServers)
    ? profile.optionalServers.map(normalizeServerEntry)
    : [];

  return {
    requiredIds: uniqueServerIds(requiredEntries),
    optionalIds: uniqueServerIds(optionalEntries),
  };
}

function resolveOptionalServers({
  profilesConfig,
  requirementsConfig,
  profileName,
  optionalMode,
  env,
}) {
  const { optionalIds } = summarizeServerSet(profilesConfig, profileName);

  if (optionalMode === 'none') {
    return {
      selectedOptionalIds: [],
      optionalServerDecisions: optionalIds.map((id) => ({
        id,
        included: false,
        reason: 'disabled_by_flag',
      })),
    };
  }

  if (optionalMode === 'force') {
    return {
      selectedOptionalIds: optionalIds,
      optionalServerDecisions: optionalIds.map((id) => ({
        id,
        included: true,
        reason: 'forced_by_flag',
      })),
    };
  }

  const selectedOptionalIds = [];
  const optionalServerDecisions = [];

  for (const serverId of optionalIds) {
    const readiness = evaluateServerRequirements(serverId, requirementsConfig, { env });
    if (readiness.ready) {
      selectedOptionalIds.push(serverId);
      optionalServerDecisions.push({
        id: serverId,
        included: true,
        reason: 'ready',
      });
      continue;
    }

    optionalServerDecisions.push({
      id: serverId,
      included: false,
      reason: readiness.failedRequiredChecks[0]?.onFail || 'unmet_requirements',
    });
  }

  return { selectedOptionalIds, optionalServerDecisions };
}

function printProfileList(profilesConfig) {
  const defaultProfile = profilesConfig.defaultProfile ?? 'minimal';
  console.log(`Default profile: ${defaultProfile}`);
  console.log('');

  for (const [profileName, profileDef] of Object.entries(profilesConfig.profiles ?? {})) {
    const requiredEntries = Array.isArray(profileDef.servers) ? profileDef.servers.map(normalizeServerEntry) : [];
    const optionalEntries = Array.isArray(profileDef.optionalServers)
      ? profileDef.optionalServers.map(normalizeServerEntry)
      : [];

    const required = uniqueServerIds(requiredEntries);
    const optional = uniqueServerIds(optionalEntries);

    console.log(`${profileName}`);
    console.log(`  ${profileDef.description ?? ''}`);
    console.log(`  required: ${required.length ? required.join(', ') : '(none)'}`);
    console.log(`  optional: ${optional.length ? optional.join(', ') : '(none)'}`);
    console.log('');
  }
}

function printStatus(profilesConfig) {
  const mcpPath = cursorMcpPath();
  const mcpConfig = readJsonIfExists(mcpPath);
  if (!mcpConfig || typeof mcpConfig !== 'object') {
    console.log(`No MCP config found at ${path.relative(process.cwd(), mcpPath)}.`);
    return;
  }

  const serverIds = Object.keys(mcpConfig.mcpServers ?? {});
  const state = readJsonIfExists(mcpStatePath());

  let activeProfile = null;
  if (state?.profile && typeof state.profile === 'string') {
    try {
      const rebuilt = buildCursorMcpConfig(profilesConfig, state.profile, {
        selectedOptionalIds: Array.isArray(state.selectedOptionalIds) ? state.selectedOptionalIds : [],
      });
      if (JSON.stringify(rebuilt.mcpConfig) === JSON.stringify(mcpConfig)) {
        activeProfile = state.profile;
      }
    } catch {
      activeProfile = null;
    }
  }

  if (!activeProfile) {
    activeProfile = inferProfileFromServers(profilesConfig, serverIds);
  }

  console.log(`Cursor MCP config: ${path.relative(process.cwd(), mcpPath)}`);
  console.log(`Active profile: ${activeProfile ?? 'custom/untracked'}`);
  console.log(`Servers: ${serverIds.length ? serverIds.join(', ') : '(none)'}`);
}

function activateProfile(profilesConfig, requirementsConfig, profileName, optionalMode) {
  getProfileDefinition(profilesConfig, profileName);
  const env = loadEnvFromFiles();

  const { selectedOptionalIds, optionalServerDecisions } = resolveOptionalServers({
    profilesConfig,
    requirementsConfig,
    profileName,
    optionalMode,
    env,
  });

  const generated = buildCursorMcpConfig(profilesConfig, profileName, {
    selectedOptionalIds,
  });

  writeJsonFile(cursorMcpPath(), generated.mcpConfig);
  writeJsonFile(mcpStatePath(), {
    profile: profileName,
    selectedOptionalIds,
    includedServerIds: generated.includedServerIds,
    skippedServers: generated.skippedServers,
    generatedAt: nowIso(),
  });

  console.log(`Activated MCP profile "${profileName}".`);
  console.log(
    `Updated ${path.relative(process.cwd(), cursorMcpPath())} with ${generated.includedServerIds.length} server(s).`,
  );

  if (optionalServerDecisions.length) {
    console.log('Optional server decisions:');
    for (const decision of optionalServerDecisions) {
      const status = decision.included ? 'included' : 'skipped';
      console.log(`  - ${decision.id}: ${status} (${decision.reason})`);
    }
  }

  if (generated.skippedServers.length) {
    console.log('Skipped because managed externally:');
    for (const skipped of generated.skippedServers) {
      console.log(`  - ${skipped.id} (${skipped.reason})`);
    }
    console.log('Configure external MCP servers in user-level client config when needed.');
  }
}

function resetToMinimal(profilesConfig, requirementsConfig) {
  activateProfile(profilesConfig, requirementsConfig, profilesConfig.defaultProfile ?? 'minimal', 'none');
}

function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0];

  if (!command) {
    usage();
    process.exit(1);
  }

  const profilesConfig = loadProfilesConfig();
  const requirementsConfig = loadRequirementsConfig();

  if (command === 'list') {
    printProfileList(profilesConfig);
    return;
  }

  if (command === 'status') {
    printStatus(profilesConfig);
    return;
  }

  if (command === 'activate') {
    const profileName = positionals[1];
    if (!profileName) {
      console.error('Missing required argument: <profile>');
      usage();
      process.exit(1);
    }
    const optionalMode = pickOptionalMode(flags);
    activateProfile(profilesConfig, requirementsConfig, profileName, optionalMode);
    return;
  }

  if (command === 'deactivate' || command === 'reset') {
    resetToMinimal(profilesConfig, requirementsConfig);
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

main();
