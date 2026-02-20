#!/usr/bin/env node
import {
  evaluateServerRequirements,
  getProfileDefinition,
  loadEnvFromFiles,
  loadProfilesConfig,
  loadRequirementsConfig,
  normalizeServerEntry,
  nowIso,
} from '../mcp/lib/mcp-core.mjs';

function parseArgs(argv) {
  const options = {
    profile: null,
    json: false,
    emitChecklist: false,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--profile') {
      options.profile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--json') {
      options.json = true;
      continue;
    }
    if (token === '--emit-checklist') {
      options.emitChecklist = true;
      continue;
    }
    if (token === '--strict') {
      options.strict = true;
      continue;
    }
  }

  return options;
}

function unique(values) {
  return Array.from(new Set(values));
}

function summarizeChecks(checks) {
  return checks.map((item) => ({
    id: item.id,
    type: item.type,
    required: item.required,
    description: item.description,
    status: item.result.status,
    message: item.result.message,
    details: item.result.details,
    onFail: item.onFail,
  }));
}

function evaluateProfileServers({ profilesConfig, requirementsConfig, profileName, env }) {
  const profile = getProfileDefinition(profilesConfig, profileName);
  const requiredEntries = Array.isArray(profile.servers) ? profile.servers.map(normalizeServerEntry) : [];
  const optionalEntries = Array.isArray(profile.optionalServers)
    ? profile.optionalServers.map(normalizeServerEntry)
    : [];

  const requiredServerIds = unique(requiredEntries.map((entry) => entry.id));
  const optionalServerIds = unique(optionalEntries.map((entry) => entry.id));

  const required = requiredServerIds.map((serverId) =>
    evaluateServerRequirements(serverId, requirementsConfig, { env }),
  );
  const optional = optionalServerIds.map((serverId) =>
    evaluateServerRequirements(serverId, requirementsConfig, { env }),
  );

  return { required, optional };
}

function buildChecklist({ required, optional, strict }) {
  const lines = [];
  const pushUnique = (line) => {
    if (!line || lines.includes(line)) {
      return;
    }
    lines.push(line);
  };

  const consumeServer = (serverResult, includeEvenIfOptionalServer = false) => {
    const hasAnyFailure =
      serverResult.failedRequiredChecks.length > 0 ||
      (strict && serverResult.failedOptionalChecks.length > 0);
    const includeServer =
      includeEvenIfOptionalServer || hasAnyFailure;
    if (!includeServer) {
      return;
    }

    for (const failedCheck of serverResult.failedRequiredChecks) {
      const action = failedCheck.onFail || `Fix check "${failedCheck.id}" for server "${serverResult.serverId}".`;
      pushUnique(`${serverResult.serverId}: ${action}`);
    }

    if (strict) {
      for (const failedCheck of serverResult.failedOptionalChecks) {
        const action = failedCheck.onFail || `Fix optional check "${failedCheck.id}" for server "${serverResult.serverId}".`;
        pushUnique(`${serverResult.serverId}: ${action}`);
      }
    }

    if (hasAnyFailure) {
      for (const setupStep of serverResult.setupChecklist) {
        pushUnique(`${serverResult.serverId}: ${setupStep}`);
      }
    }
  };

  for (const serverResult of required) {
    consumeServer(serverResult, true);
  }
  for (const serverResult of optional) {
    consumeServer(serverResult, false);
  }

  return lines;
}

function statusLabel(value) {
  return value ? 'PASS' : 'FAIL';
}

function printServerSection(title, serverResults) {
  console.log(title);
  if (!serverResults.length) {
    console.log('  (none)');
    return;
  }

  for (const serverResult of serverResults) {
    const ready = serverResult.failedRequiredChecks.length === 0;
    const marker = ready ? 'READY' : 'BLOCKED';
    console.log(`  - ${serverResult.serverId}: ${marker}`);
    for (const check of serverResult.checks) {
      const pass = check.result.status === 'pass';
      const requiredMark = check.required ? 'required' : 'optional';
      console.log(`    * ${statusLabel(pass)} [${requiredMark}] ${check.id}: ${check.result.message}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const profilesConfig = loadProfilesConfig();
  const requirementsConfig = loadRequirementsConfig();
  const env = loadEnvFromFiles();

  const profileName = options.profile || profilesConfig.defaultProfile || 'minimal';
  getProfileDefinition(profilesConfig, profileName);

  const { required, optional } = evaluateProfileServers({
    profilesConfig,
    requirementsConfig,
    profileName,
    env,
  });

  const requiredBlocking = required.filter((serverResult) => serverResult.failedRequiredChecks.length > 0);
  const optionalUnavailable = optional.filter((serverResult) => serverResult.failedRequiredChecks.length > 0);

  const strictFailures = options.strict
    ? [...required, ...optional].filter(
        (serverResult) =>
          serverResult.failedRequiredChecks.length > 0 || serverResult.failedOptionalChecks.length > 0,
      )
    : [];

  const blocked = requiredBlocking.length > 0 || (options.strict && strictFailures.length > 0);
  const checklist = buildChecklist({ required, optional, strict: options.strict });

  const report = {
    profile: profileName,
    strict: options.strict,
    generatedAt: nowIso(),
    status: blocked ? 'blocked' : 'ready',
    required: required.map((serverResult) => ({
      serverId: serverResult.serverId,
      gate: serverResult.gate,
      summary: serverResult.summary,
      ready: serverResult.ready,
      checks: summarizeChecks(serverResult.checks),
    })),
    optional: optional.map((serverResult) => ({
      serverId: serverResult.serverId,
      gate: serverResult.gate,
      summary: serverResult.summary,
      ready: serverResult.ready,
      checks: summarizeChecks(serverResult.checks),
    })),
    blockingServers: requiredBlocking.map((serverResult) => serverResult.serverId),
    unavailableOptionalServers: optionalUnavailable.map((serverResult) => serverResult.serverId),
    checklist,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(blocked ? 1 : 0);
  }

  console.log(`MCP doctor`);
  console.log(`Profile: ${profileName}`);
  console.log(`Strict mode: ${options.strict ? 'on' : 'off'}`);
  console.log(`Status: ${blocked ? 'BLOCKED' : 'READY'}`);
  console.log('');

  printServerSection('Required servers', required);
  console.log('');
  printServerSection('Optional servers', optional);

  if (options.emitChecklist || blocked) {
    console.log('');
    console.log('Checklist');
    if (!checklist.length) {
      console.log('  (no actions required)');
    } else {
      for (let index = 0; index < checklist.length; index += 1) {
        console.log(`  ${index + 1}. ${checklist[index]}`);
      }
    }
  }

  process.exit(blocked ? 1 : 0);
}

main();
