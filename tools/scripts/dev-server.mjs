#!/usr/bin/env node
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import killPort from 'kill-port';

const DEFAULT_PORT = Number(process.env.PORT ?? 5000);

function isPortFreeOn(port, host) {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, host);
  });
}

async function isPortAvailable(port) {
  // Consider port available only if neither IPv4 nor IPv6 loopback has a listener
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
    await killPort(port);
    // give the OS a brief moment to release the socket
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.warn('Automatic port cleanup failed:', error?.message ?? error);
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
  const port = await ensurePort(DEFAULT_PORT);
  // Resolve Next binary robustly across platforms
  const nextBin = process.platform === 'win32'
    ? path.join(process.cwd(), 'node_modules', '.bin', 'next.cmd')
    : path.join(process.cwd(), 'node_modules', '.bin', 'next');

  const nextPublicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `http://127.0.0.1:${port}`;
  console.log(`➡️  Starting Next.js on http://127.0.0.1:${port}`);

  // On Windows, some environments throw EINVAL when spawning .cmd directly.
  // Fallback to spawning through a shell, or using npx if necessary.
  // Bind explicitly to IPv4 to avoid ::1 conflicts on Windows
  const args = ['dev', '-H', '127.0.0.1', '-p', String(port)];
  const spawnEnv = {
    ...process.env,
    PORT: String(port),
    NEXT_PUBLIC_SITE_URL: nextPublicSiteUrl,
  };

  let child;
  try {
    child = spawn(nextBin, args, { stdio: 'inherit', env: spawnEnv });
  } catch (err) {
    if (process.platform === 'win32') {
      // Use npx via shell as a fallback on Windows
      child = spawn('npx', ['next', ...args], { stdio: 'inherit', env: spawnEnv, shell: true });
    } else {
      throw err;
    }
  }

  child.on('exit', (code, signal) => {
    if (typeof code === 'number') {
      process.exit(code);
    }
    if (signal) {
      process.kill(process.pid, signal);
    }
  });
})();
