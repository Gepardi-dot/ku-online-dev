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

const rawArgs = process.argv.slice(2);
const forwardArgs = [];
let requestedMode = process.env.SUPABASE_MCP_MODE?.trim();

for (let index = 0; index < rawArgs.length; index += 1) {
  const token = rawArgs[index];
  if (token === '--mode') {
    requestedMode = rawArgs[index + 1] ?? requestedMode;
    index += 1;
    continue;
  }
  if (token.startsWith('--mode=')) {
    requestedMode = token.slice('--mode='.length);
    continue;
  }
  forwardArgs.push(token);
}

const normalizedMode = requestedMode === 'write' ? 'write' : 'read';

const distServerPath = path.join(repoRoot, 'tools', 'supabase-mcp', 'dist', 'server.js');
if (!fs.existsSync(distServerPath)) {
  console.error(
    'Supabase MCP dist entrypoint not found at tools/supabase-mcp/dist/server.js. Build tools/supabase-mcp first.',
  );
  process.exit(1);
}

const child = spawn(process.execPath, [distServerPath, ...forwardArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_MCP_MODE: normalizedMode,
  },
});

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
