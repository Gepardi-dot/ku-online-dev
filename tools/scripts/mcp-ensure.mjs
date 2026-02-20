#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const defaultSourcePath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
const targetPath = path.join(repoRoot, '.cursor', 'mcp.json');
const syncScriptPath = path.join(repoRoot, 'tools', 'scripts', 'mcp-sync-windsurf.mjs');

function parseArgs(argv) {
  const options = {
    source: defaultSourcePath,
    strict: false,
    quiet: false,
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
    if (token === '--strict') {
      options.strict = true;
      continue;
    }
    if (token === '--quiet') {
      options.quiet = true;
      continue;
    }
  }

  return options;
}

function readJsonOrNull(absPath) {
  if (!fs.existsSync(absPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function enabledSourceServerNames(sourceConfig) {
  const servers = sourceConfig?.mcpServers ?? {};
  return Object.entries(servers)
    .filter(([, config]) => config && typeof config === 'object' && config.disabled !== true)
    .map(([name]) => name)
    .sort();
}

function targetServerNames(targetConfig) {
  return Object.keys(targetConfig?.mcpServers ?? {}).sort();
}

function missingServers(required, actualSet) {
  return required.filter((name) => !actualSet.has(name));
}

function runSync(sourcePath) {
  const args = [syncScriptPath, '--source', sourcePath];
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = path.resolve(options.source);

  const sourceConfig = readJsonOrNull(sourcePath);
  if (!sourceConfig) {
    if (options.strict) {
      console.error(`mcp:ensure failed: missing Windsurf config at ${sourcePath}`);
      process.exit(1);
    }
    if (!options.quiet) {
      console.log(`mcp:ensure: source not found (${sourcePath}); skipping sync.`);
    }
    return;
  }

  const requiredServers = enabledSourceServerNames(sourceConfig);
  const targetConfig = readJsonOrNull(targetPath);
  const actualServers = targetServerNames(targetConfig);
  const actualSet = new Set(actualServers);

  const missing = missingServers(requiredServers, actualSet);
  if (!missing.length) {
    if (!options.quiet) {
      console.log(`mcp:ensure: cursor MCP already includes all ${requiredServers.length} required server(s).`);
    }
    return;
  }

  if (!options.quiet) {
    console.log(
      `mcp:ensure: syncing missing server(s) from Windsurf baseline: ${missing.join(', ')}`,
    );
  }

  const syncResult = runSync(sourcePath);
  const exitCode = typeof syncResult.status === 'number' ? syncResult.status : 1;
  process.exit(exitCode);
}

main();
