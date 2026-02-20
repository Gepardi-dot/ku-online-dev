import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const libDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(libDir, '..', '..', '..');

const profilesPath = path.join(repoRoot, 'tools', 'mcp', 'profiles.json');
const requirementsPath = path.join(repoRoot, 'tools', 'mcp', 'requirements.json');

function readJsonFile(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw);
}

export function loadProfilesConfig() {
  return readJsonFile(profilesPath);
}

export function loadRequirementsConfig() {
  return readJsonFile(requirementsPath);
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const [, key, rawValue] = match;
  let value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadEnvFromFiles({ cwd = process.cwd(), includeProcessEnv = true } = {}) {
  const env = includeProcessEnv ? { ...process.env } : {};
  const loadedFromFiles = new Set();

  const loadFileAt = (baseDir, filename) => {
    const absPath = path.join(baseDir, filename);
    if (!fs.existsSync(absPath)) {
      return;
    }

    const raw = fs.readFileSync(absPath, 'utf8');
    for (const line of raw.split(/\r?\n/u)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      if (env[parsed.key] === undefined || loadedFromFiles.has(parsed.key)) {
        env[parsed.key] = parsed.value;
        loadedFromFiles.add(parsed.key);
      }
    }
  };

  loadFileAt(repoRoot, '.env');
  loadFileAt(repoRoot, '.env.local');
  if (path.resolve(cwd) !== repoRoot) {
    loadFileAt(cwd, '.env');
    loadFileAt(cwd, '.env.local');
  }

  return env;
}

export function normalizeServerEntry(entry) {
  if (typeof entry === 'string') {
    return { id: entry, overrides: {} };
  }

  if (
    entry &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    entry.id.trim().length > 0
  ) {
    return {
      id: entry.id,
      overrides: entry.overrides && typeof entry.overrides === 'object' ? entry.overrides : {},
    };
  }

  throw new Error(`Invalid profile server entry: ${JSON.stringify(entry)}`);
}

export function getProfileDefinition(profilesConfig, profileName) {
  const profile = profilesConfig?.profiles?.[profileName];
  if (!profile) {
    const known = Object.keys(profilesConfig?.profiles ?? {}).sort().join(', ');
    throw new Error(`Unknown MCP profile "${profileName}". Known profiles: ${known || '(none)'}`);
  }
  return profile;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, override) {
  if (!isPlainObject(base)) {
    return isPlainObject(override) ? { ...override } : override;
  }

  if (!isPlainObject(override)) {
    return { ...base };
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function profileEntries(profile) {
  const required = Array.isArray(profile.servers) ? profile.servers.map(normalizeServerEntry) : [];
  const optional = Array.isArray(profile.optionalServers)
    ? profile.optionalServers.map(normalizeServerEntry)
    : [];

  return { required, optional };
}

export function buildCursorMcpConfig(
  profilesConfig,
  profileName,
  { selectedOptionalIds = [], includeExternal = false } = {},
) {
  const profile = getProfileDefinition(profilesConfig, profileName);
  const { required, optional } = profileEntries(profile);

  const selectedOptionalSet = new Set(selectedOptionalIds);
  const includedServerIds = [];
  const skippedServers = [];
  const mcpServers = {};

  const includeEntry = (entry) => {
    const serverDef = profilesConfig?.servers?.[entry.id];
    if (!serverDef) {
      throw new Error(`Profile "${profileName}" references unknown server "${entry.id}".`);
    }

    const managedBy = serverDef.managedBy ?? 'cursor';
    if (!includeExternal && managedBy === 'external') {
      skippedServers.push({
        id: entry.id,
        reason: 'managed_externally',
      });
      return;
    }

    const baseConfig = serverDef.config && typeof serverDef.config === 'object' ? serverDef.config : {};
    const mergedConfig = deepMerge(baseConfig, entry.overrides);
    mcpServers[entry.id] = mergedConfig;
    includedServerIds.push(entry.id);
  };

  for (const entry of required) {
    includeEntry(entry);
  }

  for (const entry of optional) {
    if (!selectedOptionalSet.has(entry.id)) {
      continue;
    }
    includeEntry(entry);
  }

  return {
    mcpConfig: { mcpServers },
    includedServerIds,
    skippedServers,
    requiredServerIds: required.map((entry) => entry.id),
    optionalServerIds: optional.map((entry) => entry.id),
  };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function truncateOutput(value, max = 220) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}...`;
}

function runCommandCheck(check, env, cwd) {
  const command = check.command;
  const args = Array.isArray(check.args) ? check.args : [];
  const timeoutMs = Number.isInteger(check.timeoutMs) ? check.timeoutMs : 20000;
  const successCodes = Array.isArray(check.successCodes) && check.successCodes.length > 0 ? check.successCodes : [0];
  const spawnOptions = {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
  };
  const runOnce = (cmd) =>
    spawnSync(cmd, args, spawnOptions);

  const quoteArg = (arg) => {
    if (!/[\s"]/u.test(arg)) return arg;
    return `"${arg.replace(/"/g, '\\"')}"`;
  };

  const runViaCmd = (cmd) => {
    const cmdLine = [cmd, ...args].map(quoteArg).join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], spawnOptions);
  };

  let attemptedCommand = command;
  let result = runOnce(attemptedCommand);

  // On Windows, .cmd shims are common for npm binaries (vercel, npx, etc.).
  if (
    process.platform === 'win32' &&
    result.error?.code === 'ENOENT' &&
    !/[.](cmd|exe|bat)$/iu.test(command)
  ) {
    attemptedCommand = `${command}.cmd`;
    result = runOnce(attemptedCommand);
  }

  if (process.platform === 'win32' && result.error?.code === 'EINVAL') {
    attemptedCommand = `cmd.exe /c ${command}`;
    result = runViaCmd(command);
  }

  if (process.platform === 'win32' && result.error?.code === 'ENOENT') {
    attemptedCommand = `cmd.exe /c ${command}`;
    result = runViaCmd(command);
  }

  if (result.error) {
    const notFound = result.error.code === 'ENOENT';
    return {
      status: 'fail',
      message: notFound
        ? `Command not found: ${command}`
        : `Command failed to start: ${result.error.message}`,
      details: {
        errorCode: result.error.code,
        attemptedCommand,
      },
    };
  }

  const exitCode = typeof result.status === 'number' ? result.status : 1;
  const ok = successCodes.includes(exitCode);

  return {
    status: ok ? 'pass' : 'fail',
    message: ok ? 'Command check passed.' : `Command exited with code ${exitCode}.`,
    details: {
      attemptedCommand,
      exitCode,
      stdout: truncateOutput(result.stdout),
      stderr: truncateOutput(result.stderr),
    },
  };
}

function runEnvCheck(check, env) {
  const key = check.key;
  if (!nonEmptyString(key)) {
    return {
      status: 'fail',
      message: 'Invalid env check: missing key.',
      details: {},
    };
  }

  const present = nonEmptyString(env[key]);
  return {
    status: present ? 'pass' : 'fail',
    message: present ? `Env var present: ${key}` : `Missing env var: ${key}`,
    details: {
      key,
    },
  };
}

function runEnvAnyCheck(check, env) {
  const keys = Array.isArray(check.keys) ? check.keys.filter((key) => nonEmptyString(key)) : [];
  if (!keys.length) {
    return {
      status: 'fail',
      message: 'Invalid envAny check: missing keys.',
      details: {},
    };
  }

  const matchedKey = keys.find((key) => nonEmptyString(env[key]));
  return {
    status: matchedKey ? 'pass' : 'fail',
    message: matchedKey ? `At least one env var present (${matchedKey}).` : `Missing all env vars: ${keys.join(', ')}`,
    details: {
      keys,
      matchedKey: matchedKey ?? null,
    },
  };
}

function runFileExistsCheck(check, cwd) {
  const rawPath = check.path;
  if (!nonEmptyString(rawPath)) {
    return {
      status: 'fail',
      message: 'Invalid fileExists check: missing path.',
      details: {},
    };
  }

  const absPath = path.isAbsolute(rawPath) ? rawPath : path.join(cwd, rawPath);
  const exists = fs.existsSync(absPath);

  return {
    status: exists ? 'pass' : 'fail',
    message: exists ? `File found: ${rawPath}` : `Missing file: ${rawPath}`,
    details: {
      path: rawPath,
      absolutePath: absPath,
    },
  };
}

export function runSingleCheck(check, { env, cwd = repoRoot } = {}) {
  const type = check.type;
  if (type === 'command') {
    return runCommandCheck(check, env, cwd);
  }
  if (type === 'env') {
    return runEnvCheck(check, env);
  }
  if (type === 'envAny') {
    return runEnvAnyCheck(check, env);
  }
  if (type === 'fileExists') {
    return runFileExistsCheck(check, cwd);
  }

  return {
    status: 'fail',
    message: `Unsupported check type: ${type}`,
    details: {},
  };
}

export function evaluateServerRequirements(serverId, requirementsConfig, { env, cwd = repoRoot } = {}) {
  const requirement = requirementsConfig?.servers?.[serverId] ?? {};
  const checks = Array.isArray(requirement.checks) ? requirement.checks : [];

  const checkResults = checks.map((check) => {
    const outcome = runSingleCheck(check, { env, cwd });
    return {
      id: check.id ?? '(unnamed-check)',
      type: check.type ?? 'unknown',
      required: check.required !== false,
      description: check.description ?? '',
      onFail: check.onFail ?? '',
      result: outcome,
    };
  });

  const failedRequiredChecks = checkResults.filter(
    (item) => item.required && item.result.status === 'fail',
  );
  const failedOptionalChecks = checkResults.filter(
    (item) => !item.required && item.result.status === 'fail',
  );

  return {
    serverId,
    gate: requirement.gate ?? 'soft',
    summary: requirement.summary ?? '',
    setupChecklist: Array.isArray(requirement.setupChecklist) ? requirement.setupChecklist : [],
    checks: checkResults,
    ready: failedRequiredChecks.length === 0,
    failedRequiredChecks,
    failedOptionalChecks,
  };
}

export function writeJsonFile(absPath, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, json, 'utf8');
}

export function cursorMcpPath() {
  return path.join(repoRoot, '.cursor', 'mcp.json');
}

export function mcpStatePath() {
  return path.join(repoRoot, '.tmp', 'mcp-profile-state.json');
}

export function readJsonIfExists(absPath) {
  if (!fs.existsSync(absPath)) {
    return null;
  }
  return readJsonFile(absPath);
}

export function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

export function nowIso() {
  return new Date().toISOString();
}
