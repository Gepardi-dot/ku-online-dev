#!/usr/bin/env node
import { createConnection, createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rm, stat } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PORT = Number(process.env.PORT ?? 5000);
const DEFAULT_HOST = process.env.HOST ?? '0.0.0.0';
const DEV_MAX_HTTP_HEADER_SIZE = process.env.NEXT_DEV_MAX_HTTP_HEADER_SIZE ?? '65536';
const MIN_VALID_SWC_BINARY_SIZE_BYTES = 20 * 1024 * 1024;
const SUPABASE_CONNECT_TIMEOUT_MS = 1200;
const SUPABASE_CONNECT_RETRIES = 6;
const SUPABASE_RETRY_DELAY_MS = 800;
const ENV_FILES = ['.env.local', '.env'];
const require = createRequire(import.meta.url);
const envFileCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEnvFile(relativePath) {
  if (envFileCache.has(relativePath)) {
    return envFileCache.get(relativePath);
  }

  const values = new Map();
  const absPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absPath)) {
    envFileCache.set(relativePath, values);
    return values;
  }

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
    values.set(key, value);
  }

  envFileCache.set(relativePath, values);
  return values;
}

function getEnvValue(key) {
  const runtimeValue = normalizeOptionalString(process.env[key]);
  if (runtimeValue) return runtimeValue;

  for (const file of ENV_FILES) {
    const fromFile = normalizeOptionalString(parseEnvFile(file).get(key));
    if (fromFile) return fromFile;
  }

  return undefined;
}

function normalizeBundler(value) {
  const bundler = String(value ?? '').trim().toLowerCase();
  if (!bundler) return null;
  if (bundler === 'webpack') return 'webpack';
  if (bundler === 'turbo' || bundler === 'turbopack') return 'turbopack';
  return null;
}

function resolveBundler() {
  const requested = normalizeBundler(process.env.NEXT_DEV_BUNDLER);
  if (requested) return requested;
  return 'turbopack';
}

function resolveDevMode() {
  const mode = String(process.env.NEXT_DEV_MODE ?? 'auto').trim().toLowerCase();
  if (mode === 'auto' || mode === 'local' || mode === 'remote') {
    return mode;
  }
  console.warn(`Unknown NEXT_DEV_MODE="${mode}". Falling back to "auto".`);
  return 'auto';
}

function resolveWindowsSwcPackage() {
  if (process.platform !== 'win32') return null;
  if (process.arch === 'x64') return '@next/swc-win32-x64-msvc';
  if (process.arch === 'arm64') return '@next/swc-win32-arm64-msvc';
  if (process.arch === 'ia32') return '@next/swc-win32-ia32-msvc';
  return null;
}

function resolveWindowsSwcBinaryName() {
  if (process.platform !== 'win32') return null;
  if (process.arch === 'x64') return 'next-swc.win32-x64-msvc.node';
  if (process.arch === 'arm64') return 'next-swc.win32-arm64-msvc.node';
  if (process.arch === 'ia32') return 'next-swc.win32-ia32-msvc.node';
  return null;
}

function clearRequireCache(moduleName) {
  try {
    const resolved = require.resolve(moduleName);
    delete require.cache[resolved];
  } catch {}
}

function tryLoadWindowsNativeSwc() {
  const swcPackage = resolveWindowsSwcPackage();
  if (!swcPackage) return { ok: false, error: new Error('Unsupported Windows architecture for native SWC') };

  try {
    require(swcPackage);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

function resolveWindowsSwcBinaryPath(swcPackage, swcBinaryName) {
  try {
    const packageJsonPath = require.resolve(`${swcPackage}/package.json`);
    return path.join(path.dirname(packageJsonPath), swcBinaryName);
  } catch {
    return path.join(process.cwd(), 'node_modules', ...swcPackage.split('/'), swcBinaryName);
  }
}

async function hasReasonableWindowsSwcBinarySize(swcPackage, swcBinaryName) {
  try {
    const binaryPath = resolveWindowsSwcBinaryPath(swcPackage, swcBinaryName);
    const file = await stat(binaryPath);
    return file.size >= MIN_VALID_SWC_BINARY_SIZE_BYTES;
  } catch {
    return false;
  }
}

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function runNpmCommand(args) {
  if (process.platform === 'win32') {
    await runCommand('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args]);
    return;
  }
  await runCommand('npm', args);
}

async function repairWindowsNativeSwc(swcPackage) {
  const nextVersion = require('next/package.json').version;
  const packageSpec = `${swcPackage}@${nextVersion}`;
  const packageDir = path.join(process.cwd(), 'node_modules', ...swcPackage.split('/'));
  await rm(packageDir, { recursive: true, force: true });
  console.warn(`Attempting SWC repair via \`npm install ${packageSpec} --no-save\`...`);
  await runNpmCommand(['install', packageSpec, '--no-save']);
}

async function ensureWindowsNativeSwcForTurbopack() {
  if (process.platform !== 'win32') return;

  const swcPackage = resolveWindowsSwcPackage();
  const swcBinaryName = resolveWindowsSwcBinaryName();
  if (!swcPackage || !swcBinaryName) return;

  const initialLoad = tryLoadWindowsNativeSwc();
  const initialSizeOk = await hasReasonableWindowsSwcBinarySize(swcPackage, swcBinaryName);
  if (initialLoad.ok && initialSizeOk) return;

  const initialMessage = initialLoad.error?.message ?? 'unknown native SWC load error';
  console.warn(`Native SWC check failed for ${swcPackage}: ${initialMessage}`);
  if (!initialSizeOk) {
    console.warn('Installed SWC binary appears incomplete. Repairing...');
  }

  await repairWindowsNativeSwc(swcPackage);
  clearRequireCache(swcPackage);

  const repairedLoad = tryLoadWindowsNativeSwc();
  const repairedSizeOk = await hasReasonableWindowsSwcBinarySize(swcPackage, swcBinaryName);
  if (repairedLoad.ok && repairedSizeOk) {
    console.log(`Native SWC is healthy after repair (${swcPackage}).`);
    return;
  }

  const repairedMessage = repairedLoad.error?.message ?? 'unknown native SWC load error after repair';
  throw new Error(
    `Native SWC still failed after repair (${swcPackage}): ${repairedMessage}. ` +
      'Set NEXT_DEV_BUNDLER=webpack temporarily while investigating the host runtime.'
  );
}

function isLoopbackHost(host) {
  const normalized = String(host ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') return true;
  if (normalized === '127.0.0.1') return true;
  if (normalized.startsWith('127.')) return true;
  return false;
}

function parseSupabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Supabase URL is invalid: ${rawUrl}`);
  }

  const host = parsed.hostname;
  if (!host) throw new Error(`Supabase URL has no hostname: ${rawUrl}`);

  const defaultPort = parsed.protocol === 'https:' ? 443 : 80;
  const port = Number(parsed.port || defaultPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Supabase URL has an invalid port: ${rawUrl}`);
  }

  return { host, port, rawUrl, isLoopback: isLoopbackHost(host) };
}

function resolveSupabaseEndpointForDevMode(devMode) {
  const configuredUrl = getEnvValue('NEXT_PUBLIC_SUPABASE_URL') ?? getEnvValue('SUPABASE_URL');

  if (configuredUrl) {
    const endpoint = parseSupabaseUrl(configuredUrl);

    if (devMode === 'remote' && endpoint.isLoopback) {
      throw new Error(
        `NEXT_DEV_MODE=remote but Supabase URL points to local (${configuredUrl}). ` +
          'Set remote Supabase env vars or run `npm run dev:local`.'
      );
    }

    if (devMode === 'local' && !endpoint.isLoopback) {
      throw new Error(
        `NEXT_DEV_MODE=local but Supabase URL is not loopback (${configuredUrl}). ` +
          'Use local Supabase URL or run `npm run dev:remote`.'
      );
    }

    if (devMode === 'auto' && !endpoint.isLoopback) {
      return null;
    }

    return endpoint;
  }

  if (devMode === 'local') {
    return {
      host: '127.0.0.1',
      port: 54321,
      rawUrl: 'http://127.0.0.1:54321',
      isLoopback: true,
    };
  }

  return null;
}

function canConnectTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finalize = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finalize(true));
    socket.on('timeout', () => finalize(false));
    socket.on('error', () => finalize(false));
  });
}

async function waitForTcpEndpoint(host, port, retries, delayMs) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const connected = await canConnectTcp(host, port, SUPABASE_CONNECT_TIMEOUT_MS);
    if (connected) return true;
    if (attempt < retries) {
      await sleep(delayMs);
    }
  }
  return false;
}

async function ensureSupabasePreflight(devMode) {
  const endpoint = resolveSupabaseEndpointForDevMode(devMode);
  if (!endpoint) return;

  const ready = await waitForTcpEndpoint(
    endpoint.host,
    endpoint.port,
    SUPABASE_CONNECT_RETRIES,
    SUPABASE_RETRY_DELAY_MS
  );
  if (ready) return;

  console.error(`Supabase is not reachable at ${endpoint.host}:${endpoint.port} (${endpoint.rawUrl}).`);
  console.error('If using local mode, start services with `supabase start` or run `npm run dev:up`.');
  console.error('If using remote mode, switch to `npm run dev:remote` and load remote Supabase env values.');
  process.exit(1);
}

function withMaxHeaderNodeOption(existingNodeOptions) {
  const maxHeaderFlag = `--max-http-header-size=${DEV_MAX_HTTP_HEADER_SIZE}`;

  if (!existingNodeOptions || existingNodeOptions.trim() === '') {
    return maxHeaderFlag;
  }

  if (existingNodeOptions.includes('--max-http-header-size')) {
    return existingNodeOptions;
  }

  return `${existingNodeOptions} ${maxHeaderFlag}`.trim();
}

function isPortFreeOn(port, host) {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, host);
  });
}

async function isPortAvailable(port) {
  const [v4, v6, any] = await Promise.all([
    isPortFreeOn(port, '127.0.0.1'),
    isPortFreeOn(port, '::1').catch(() => false),
    isPortFreeOn(port, '0.0.0.0'),
  ]);
  return v4 && v6 && any;
}

function showPortInstructions(port) {
  console.error(`\nPort ${port} is in use. The dev server must run on ${port}.`);
  console.error('Please stop the process using this port and rerun `npm run dev`.');
  if (process.platform === 'win32') {
    console.error('\nWindows tips:');
    console.error(`  netstat -ano | findstr :${port}`);
    console.error('  taskkill /PID <PID> /F');
  } else {
    console.error('\nmacOS/Linux tips:');
    console.error(`  lsof -i :${port}`);
    console.error('  kill -9 <PID>');
  }
}

async function ensurePort(port) {
  const available = await isPortAvailable(port);
  if (available) return port;

  console.warn(`Port ${port} appears busy. Attempting to free it automatically...`);
  try {
    const { default: killPort } = await import('kill-port');
    await killPort(port);
    await sleep(500);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (error?.code === 'ERR_MODULE_NOT_FOUND' || message.includes("Cannot find package 'kill-port'")) {
      console.warn("Automatic port cleanup unavailable because package 'kill-port' is not installed.");
    } else {
      console.warn('Automatic port cleanup failed:', message);
    }
  }

  const freed = await isPortAvailable(port);
  if (freed) {
    console.log(`Successfully freed port ${port}.`);
    return port;
  }

  showPortInstructions(port);
  process.exit(1);
}

(async () => {
  const devMode = resolveDevMode();
  const bundler = resolveBundler();

  try {
    await ensureSupabasePreflight(devMode);
  } catch (error) {
    const message = error?.message ?? String(error);
    console.error(message);
    process.exit(1);
  }

  if (bundler === 'turbopack') {
    try {
      await ensureWindowsNativeSwcForTurbopack();
    } catch (error) {
      const message = error?.message ?? String(error);
      console.error(message);
      process.exit(1);
    }
  }

  const port = await ensurePort(DEFAULT_PORT);
  const nextCli = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const displayHost = DEFAULT_HOST === '0.0.0.0' ? 'localhost' : DEFAULT_HOST;
  const nextPublicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `http://${displayHost}:${port}`;
  console.log(`➡️  Starting Next.js on http://${displayHost}:${port} (${bundler}, ${devMode})`);

  const bundlerArg = bundler === 'webpack' ? '--webpack' : '--turbopack';
  const args = ['dev', bundlerArg, '-H', DEFAULT_HOST, '-p', String(port)];
  const spawnEnv = {
    ...process.env,
    PORT: String(port),
    NEXT_PUBLIC_SITE_URL: nextPublicSiteUrl,
    NODE_OPTIONS: withMaxHeaderNodeOption(process.env.NODE_OPTIONS),
  };

  const child = spawn(process.execPath, [nextCli, ...args], { stdio: 'inherit', env: spawnEnv });

  child.on('error', (error) => {
    const message = error?.message ?? String(error);
    console.error(`Failed to start Next.js dev server: ${message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (typeof code === 'number') {
      process.exit(code);
    }
    if (signal) {
      process.kill(process.pid, signal);
    }
  });
})();
