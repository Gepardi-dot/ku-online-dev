#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const loadedFromFiles = new Set();

function loadEnvFileAt(baseDir, filename) {
  const absPath = path.join(baseDir, filename);
  if (!fs.existsSync(absPath)) return;

  const raw = fs.readFileSync(absPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const [, key, rest] = match;
    let value = rest.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined || loadedFromFiles.has(key)) {
      process.env[key] = value;
      loadedFromFiles.add(key);
    }
  }
}

if (process.env.NODE_ENV !== 'production') {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..', '..');

  // Prefer repo-level env files, then fall back to current working directory.
  loadEnvFileAt(repoRoot, '.env');
  loadEnvFileAt(repoRoot, '.env.local');
  loadEnvFileAt(process.cwd(), '.env');
  loadEnvFileAt(process.cwd(), '.env.local');
}

const extraArgs = process.argv.slice(2);
const require = createRequire(import.meta.url);
let localEntrypoint;
try {
  const pkgJsonPath = require.resolve('@vonage/vonage-mcp-server-api-bindings/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const binField = pkg?.bin;
  const binRel =
    typeof binField === 'string'
      ? binField
      : binField && typeof binField === 'object'
        ? Object.values(binField)[0]
        : undefined;
  if (binRel) {
    localEntrypoint = path.resolve(path.dirname(pkgJsonPath), binRel);
  }
} catch {
  localEntrypoint = undefined;
}

let child;
if (localEntrypoint) {
  child = spawn(process.execPath, [localEntrypoint, ...extraArgs], {
    stdio: 'inherit',
    env: process.env,
  });
} else if (process.platform === 'win32') {
  // EINVAL can occur when spawning .cmd directly; use cmd.exe instead.
  const quoteArg = (arg) => {
    if (!/[\s"]/u.test(arg)) return arg;
    return `"${arg.replace(/"/g, '\\"')}"`;
  };
  const cmdLine = `npx ${['-y', '@vonage/vonage-mcp-server-api-bindings', ...extraArgs]
    .map(quoteArg)
    .join(' ')}`;
  child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
    stdio: 'inherit',
    env: process.env,
  });
} else {
  child = spawn('npx', ['-y', '@vonage/vonage-mcp-server-api-bindings', ...extraArgs], {
    stdio: 'inherit',
    env: process.env,
  });
}

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
