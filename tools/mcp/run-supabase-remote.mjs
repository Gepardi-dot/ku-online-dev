#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const loadedFromFiles = new Set();

function loadEnvFileAt(baseDir, filename) {
  const absPath = path.join(baseDir, filename);
  if (!fs.existsSync(absPath)) return;

  const raw = fs.readFileSync(absPath, 'utf8');
  for (const line of raw.split(/\r?\n/u)) {
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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

if (process.env.NODE_ENV !== 'production') {
  loadEnvFileAt(repoRoot, '.env');
  loadEnvFileAt(repoRoot, '.env.local');
  loadEnvFileAt(process.cwd(), '.env');
  loadEnvFileAt(process.cwd(), '.env.local');
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is required to run remote Supabase MCP.');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);

let child;
if (process.platform === 'win32') {
  const quoteArg = (arg) => {
    if (!/[\s"]/u.test(arg)) return arg;
    return `"${arg.replace(/"/g, '\\"')}"`;
  };
  const cmdLine = `npx ${[
    '-y',
    '@supabase/mcp-server-supabase@latest',
    '--access-token',
    token,
    ...extraArgs,
  ]
    .map(quoteArg)
    .join(' ')}`;

  child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
    stdio: 'inherit',
    env: process.env,
  });
} else {
  child = spawn(
    'npx',
    ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', token, ...extraArgs],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );
}

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
