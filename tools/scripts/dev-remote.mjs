#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function loadEnvFile(relativePath) {
  const absPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absPath)) return false;

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

    // Remote mode intentionally overrides local defaults from .env.local.
    process.env[key] = value;
  }

  return true;
}

function parseRemoteEnvFileArgument(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== '--env-file' && arg !== '-e') continue;
    const value = normalizeOptionalString(argv[index + 1]);
    if (!value) {
      console.error(`Missing value for ${arg}. Example: npm run dev:remote -- --env-file .env.remote.local`);
      process.exit(1);
    }
    return value;
  }
  return undefined;
}

const argv = process.argv.slice(2);
const explicitEnvFile = parseRemoteEnvFileArgument(argv);
const filesToTry = ['.env.remote', '.env.remote.local'];
if (explicitEnvFile) filesToTry.push(explicitEnvFile);

const loadedFiles = filesToTry.filter((file) => loadEnvFile(file));
if (loadedFiles.length > 0) {
  console.log(`Loaded remote env files: ${loadedFiles.join(', ')}`);
} else {
  console.warn('No remote env file was loaded. Using current process environment variables.');
}

process.env.NEXT_DEV_MODE = 'remote';
await import('./dev-server.mjs');
