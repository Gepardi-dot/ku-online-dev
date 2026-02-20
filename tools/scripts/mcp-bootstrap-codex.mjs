#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCursorMcpConfig,
  evaluateServerRequirements,
  getProfileDefinition,
  loadEnvFromFiles,
  loadProfilesConfig,
  loadRequirementsConfig,
  normalizeServerEntry,
  nowIso,
  writeJsonFile,
} from '../mcp/lib/mcp-core.mjs';

function parseArgs(argv) {
  const options = {
    apply: false,
    profile: null,
    forceOptional: false,
    noOptional: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      options.apply = true;
      continue;
    }
    if (token === '--profile') {
      options.profile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--force-optional') {
      options.forceOptional = true;
      continue;
    }
    if (token === '--no-optional') {
      options.noOptional = true;
      continue;
    }
  }

  return options;
}

function chooseOptionalServerIds(profileName, profilesConfig, requirementsConfig, env, options) {
  const profile = getProfileDefinition(profilesConfig, profileName);
  const optionalEntries = Array.isArray(profile.optionalServers)
    ? profile.optionalServers.map(normalizeServerEntry)
    : [];
  const optionalIds = Array.from(new Set(optionalEntries.map((entry) => entry.id)));

  if (options.noOptional) {
    return [];
  }
  if (options.forceOptional) {
    return optionalIds;
  }

  const selected = [];
  for (const serverId of optionalIds) {
    const readiness = evaluateServerRequirements(serverId, requirementsConfig, { env });
    if (readiness.ready) {
      selected.push(serverId);
    }
  }
  return selected;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const profilesConfig = loadProfilesConfig();
  const requirementsConfig = loadRequirementsConfig();
  const env = loadEnvFromFiles();

  const profileName = options.profile || profilesConfig.defaultProfile || 'minimal';
  getProfileDefinition(profilesConfig, profileName);

  const selectedOptionalIds = chooseOptionalServerIds(
    profileName,
    profilesConfig,
    requirementsConfig,
    env,
    options,
  );

  const generated = buildCursorMcpConfig(profilesConfig, profileName, {
    selectedOptionalIds,
    includeExternal: true,
  });

  const codexHome = path.join(os.homedir(), '.codex');
  const codexMcpPath = path.join(codexHome, 'mcp.json');

  if (!options.apply) {
    console.log('Dry run only. No files changed.');
    console.log(`Target file: ${codexMcpPath}`);
    console.log(`Profile: ${profileName}`);
    console.log(`Included servers: ${generated.includedServerIds.join(', ') || '(none)'}`);
    console.log('');
    console.log('Snippet to apply:');
    console.log(JSON.stringify(generated.mcpConfig, null, 2));
    console.log('');
    console.log('Apply this setup with:');
    console.log('  npm run mcp:bootstrap:codex -- --apply');
    return;
  }

  const backupPath = path.join(codexHome, `mcp.json.bak-${Date.now()}`);
  if (fs.existsSync(codexMcpPath)) {
    const existing = JSON.parse(fs.readFileSync(codexMcpPath, 'utf8'));
    writeJsonFile(backupPath, existing);
  }

  writeJsonFile(codexMcpPath, generated.mcpConfig);
  console.log(`Wrote ${codexMcpPath}`);
  console.log(`Profile: ${profileName}`);
  console.log(`Generated at: ${nowIso()}`);
  if (generated.skippedServers.length) {
    console.log('Some servers were skipped because they are managed externally:');
    for (const skipped of generated.skippedServers) {
      console.log(`  - ${skipped.id} (${skipped.reason})`);
    }
  }
}

main();
