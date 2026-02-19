#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const nextDir = path.join(rootDir, '.next');
const chunksDir = path.join(nextDir, 'static', 'chunks');
const buildManifestPath = path.join(nextDir, 'build-manifest.json');

function readBudget(name, fallback, options = {}) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof options.min === 'number' && parsed < options.min) return fallback;
  if (typeof options.max === 'number' && parsed > options.max) return fallback;
  return parsed;
}

const budgetKb = {
  totalClientJs: readBudget('PERF_BUDGET_TOTAL_CLIENT_JS_KB', 2_500, { min: 100 }),
  largestChunk: readBudget('PERF_BUDGET_LARGEST_CHUNK_KB', 320, { min: 20 }),
  rootMainJs: readBudget('PERF_BUDGET_ROOT_MAIN_JS_KB', 600, { min: 50 }),
  polyfillJs: readBudget('PERF_BUDGET_POLYFILL_JS_KB', 180, { min: 10 }),
};

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)}KB`;
}

function toBytes(kb) {
  return Math.round(kb * 1024);
}

function collectJsFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function readBuildManifest() {
  if (!fs.existsSync(buildManifestPath)) {
    throw new Error(`Missing build manifest at ${buildManifestPath}. Run "npm run build" first.`);
  }

  const raw = fs.readFileSync(buildManifestPath, 'utf8');
  return JSON.parse(raw);
}

function sumFiles(filePaths) {
  let total = 0;
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    total += fs.statSync(filePath).size;
  }
  return total;
}

function main() {
  if (!fs.existsSync(nextDir)) {
    throw new Error('Missing .next build output. Run "npm run build" before running perf budgets.');
  }

  const chunkFiles = collectJsFiles(chunksDir);
  if (chunkFiles.length === 0) {
    throw new Error(`No JavaScript chunk files found under ${chunksDir}.`);
  }

  const totalClientJsBytes = sumFiles(chunkFiles);
  const largestChunk = chunkFiles
    .map((filePath) => ({ filePath, bytes: fs.statSync(filePath).size }))
    .sort((a, b) => b.bytes - a.bytes)[0];

  const buildManifest = readBuildManifest();
  const rootMainFiles = Array.isArray(buildManifest.rootMainFiles) ? buildManifest.rootMainFiles : [];
  const polyfillFiles = Array.isArray(buildManifest.polyfillFiles) ? buildManifest.polyfillFiles : [];

  const rootMainPaths = rootMainFiles.map((relativePath) => path.join(nextDir, relativePath));
  const polyfillPaths = polyfillFiles.map((relativePath) => path.join(nextDir, relativePath));

  const rootMainBytes = sumFiles(rootMainPaths);
  const polyfillBytes = sumFiles(polyfillPaths);

  const checks = [
    {
      name: 'Total client JS',
      current: totalClientJsBytes,
      budget: toBytes(budgetKb.totalClientJs),
    },
    {
      name: 'Largest JS chunk',
      current: largestChunk.bytes,
      budget: toBytes(budgetKb.largestChunk),
      detail: path.relative(rootDir, largestChunk.filePath),
    },
    {
      name: 'Root main JS',
      current: rootMainBytes,
      budget: toBytes(budgetKb.rootMainJs),
    },
    {
      name: 'Polyfill JS',
      current: polyfillBytes,
      budget: toBytes(budgetKb.polyfillJs),
    },
  ];

  const failingChecks = checks.filter((check) => check.current > check.budget);

  console.log('Performance budget report');
  console.log(`- Total chunk files: ${chunkFiles.length}`);
  for (const check of checks) {
    const status = check.current > check.budget ? 'FAIL' : 'PASS';
    const detail = check.detail ? ` (${check.detail})` : '';
    console.log(
      `- [${status}] ${check.name}: ${formatKb(check.current)} / budget ${formatKb(check.budget)}${detail}`,
    );
  }

  if (failingChecks.length > 0) {
    const failedNames = failingChecks.map((check) => check.name).join(', ');
    throw new Error(`Performance budgets exceeded: ${failedNames}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`perf-budget error: ${message}`);
  process.exit(1);
}
