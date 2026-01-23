#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const loadedFromFiles = new Set();

function loadEnvFile(relativePath) {
  const absPath = path.join(process.cwd(), relativePath);
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
  loadEnvFile('.env');
  loadEnvFile('.env.local');
}

const extraArgs = process.argv.slice(2);
const childArgs = ['-y', '@vonage/vonage-mcp-server-api-bindings', ...extraArgs];

let child;
if (process.platform === 'win32') {
  // EINVAL can occur when spawning .cmd directly; use cmd.exe instead.
  const cmdLine = `npx ${childArgs.map((arg) => `"${arg}"`).join(' ')}`;
  child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
    stdio: 'inherit',
    env: process.env,
  });
} else {
  child = spawn('npx', childArgs, {
    stdio: 'inherit',
    env: process.env,
  });
}

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
