#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const defaultSourcePath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
const targetPath = path.join(repoRoot, '.cursor', 'mcp.json');

function parseArgs(argv) {
  const options = {
    source: defaultSourcePath,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source') {
      options.source = argv[index + 1] ?? options.source;
      index += 1;
      continue;
    }
    if (token.startsWith('--source=')) {
      options.source = token.slice('--source='.length);
      continue;
    }
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
  }

  return options;
}

function readJson(absPath) {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing file: ${absPath}`);
  }
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function isLikelySecret(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (text.startsWith('${')) return false;

  const explicitPatterns = [
    /github_pat_/iu,
    /ghp_/iu,
    /gho_/iu,
    /ghu_/iu,
    /ghs_/iu,
    /ghr_/iu,
    /sb_secret_/iu,
    /^sk-/iu,
    /^xox[abprs]-/iu,
  ];

  if (explicitPatterns.some((pattern) => pattern.test(text))) {
    return true;
  }

  // Generic long bearer/token-like values.
  if (text.length >= 40 && /[a-z]/iu.test(text) && /[0-9]/u.test(text)) {
    return true;
  }

  return false;
}

function sanitizeHeaders(serverName, headers, warnings) {
  if (!headers || typeof headers !== 'object') {
    return headers;
  }

  const nextHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isLikelySecret(value)) {
      warnings.push(
        `[${serverName}] removed sensitive header "${key}" while syncing to tracked .cursor/mcp.json`,
      );
      continue;
    }
    nextHeaders[key] = value;
  }

  return Object.keys(nextHeaders).length ? nextHeaders : {};
}

function relativizeRepoArg(arg) {
  if (typeof arg !== 'string' || !path.isAbsolute(arg)) {
    return arg;
  }

  const normalizedRepo = path.resolve(repoRoot);
  const normalizedArg = path.resolve(arg);
  if (!normalizedArg.startsWith(normalizedRepo)) {
    return arg;
  }

  const relative = path.relative(normalizedRepo, normalizedArg).replace(/\\/g, '/');
  return relative || arg;
}

function normalizeServer(name, serverConfig, warnings) {
  const next = { ...serverConfig };
  delete next.disabled;
  delete next.disabledTools;

  if (Array.isArray(next.args)) {
    next.args = next.args.map(relativizeRepoArg);
  }

  if (next.headers && typeof next.headers === 'object') {
    next.headers = sanitizeHeaders(name, next.headers, warnings);
  }

  // Cursor MCP configs in the wild vary between `url` and `serverUrl`.
  // Preserve whichever exists and mirror to the other key for compatibility.
  if (typeof next.serverUrl === 'string' && next.serverUrl.trim().length > 0 && !next.url) {
    next.url = next.serverUrl;
  }
  if (typeof next.url === 'string' && next.url.trim().length > 0 && !next.serverUrl) {
    next.serverUrl = next.url;
  }

  return next;
}

function buildCursorConfigFromWindsurf(source) {
  const warnings = [];
  const mcpServers = {};
  const sourceServers = source?.mcpServers ?? {};
  const names = Object.keys(sourceServers).sort();

  for (const name of names) {
    const serverConfig = sourceServers[name];
    if (!serverConfig || typeof serverConfig !== 'object') {
      continue;
    }

    if (serverConfig.disabled === true) {
      continue;
    }

    mcpServers[name] = normalizeServer(name, serverConfig, warnings);
  }

  return { mcpServers, warnings };
}

function writeJson(absPath, data) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = path.resolve(options.source);

  let source;
  try {
    source = readJson(sourcePath);
  } catch (error) {
    console.error(`mcp-sync-windsurf failed: ${error.message}`);
    console.error(`Expected source file: ${sourcePath}`);
    process.exit(1);
  }

  const { mcpServers, warnings } = buildCursorConfigFromWindsurf(source);
  const output = { mcpServers };

  if (options.dryRun) {
    console.log(`Dry run: would sync ${Object.keys(mcpServers).length} server(s) from ${sourcePath}`);
    console.log(JSON.stringify(output, null, 2));
  } else {
    writeJson(targetPath, output);
    console.log(
      `Synced ${Object.keys(mcpServers).length} enabled MCP server(s) from Windsurf to ${path.relative(repoRoot, targetPath)}.`,
    );
  }

  if (warnings.length) {
    console.log('');
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

main();
