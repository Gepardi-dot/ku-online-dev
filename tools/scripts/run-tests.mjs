import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  execSync(`${npmCmd} run build:test`, { stdio: 'inherit' });
} catch (error) {
  const exitCode = typeof error?.status === 'number' ? error.status : 1;
  process.exit(exitCode);
}

const distRoot = path.resolve(process.cwd(), 'dist-tests');
const testFiles = [];

function collectTests(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(fullPath);
      continue;
    }

    if (entry.name.endsWith('.test.js') || entry.name.endsWith('.test.mjs')) {
      testFiles.push(fullPath);
    }
  }
}

if (fs.existsSync(distRoot)) {
  collectTests(distRoot);
}

if (testFiles.length === 0) {
  console.log('No compiled test files found in dist-tests; skipping test run.');
  process.exit(0);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const nodeArgs = ['--test', '--loader', './tools/test-stubs/alias-loader.mjs', ...testFiles];
const nodeResult = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });

process.exit(nodeResult.status ?? 1);
