#!/usr/bin/env node
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const TOKEN_ENV_KEY = 'SUPABASE_ACCESS_TOKEN';
const DEFAULT_INTERVAL_SECONDS = 10;
const DEFAULT_TIMEOUT_SECONDS = 300;

function printUsage() {
  console.log('Usage: npm run supabase:project:status -- --project-ref <ref> [--expect <status>] [--timeout-seconds <n>] [--interval-seconds <n>] [--json]');
  console.log('Requires SUPABASE_ACCESS_TOKEN. Uses read-only Supabase Management API project status.');
}

export function parsePositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const args = {
    projectRef: '',
    expect: '',
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--project-ref') {
      args.projectRef = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (current === '--expect') {
      args.expect = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (current === '--timeout-seconds') {
      args.timeoutSeconds = parsePositiveNumber(argv[index + 1], '--timeout-seconds');
      index += 1;
      continue;
    }
    if (current === '--interval-seconds') {
      args.intervalSeconds = parsePositiveNumber(argv[index + 1], '--interval-seconds');
      index += 1;
      continue;
    }
    if (current === '--json') {
      args.json = true;
      continue;
    }
    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${current}`);
  }

  if (!args.projectRef) {
    printUsage();
    process.exit(1);
  }

  return args;
}

async function fetchProject(projectRef, token) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Project status failed with ${response.status}: ${raw.slice(0, 500)}`);
  }

  return JSON.parse(raw);
}

export function summarizeProject(project) {
  return {
    ref: project?.ref ?? project?.id ?? '',
    name: project?.name ?? '',
    status: project?.status ?? 'unknown',
    region: project?.region ?? '',
    database: project?.database ?? null,
  };
}

function printProject(project) {
  const summary = summarizeProject(project);
  console.log(`${summary.ref} (${summary.name || 'unknown'}): ${summary.status}`);
  if (summary.region) {
    console.log(`  region: ${summary.region}`);
  }
  if (summary.database?.version) {
    console.log(`  database: postgres ${summary.database.version}`);
  }
}

async function waitForStatus({ projectRef, token, expect, timeoutSeconds, intervalSeconds, json }) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastProject = null;

  for (;;) {
    lastProject = await fetchProject(projectRef, token);
    const status = lastProject?.status ?? 'unknown';
    if (status === expect) {
      if (json) {
        console.log(JSON.stringify({ project: summarizeProject(lastProject), matched: true }, null, 2));
      } else {
        printProject(lastProject);
        console.log(`Matched expected status: ${expect}`);
      }
      return;
    }

    if (Date.now() >= deadline) {
      const summary = summarizeProject(lastProject);
      if (json) {
        console.log(JSON.stringify({ project: summary, matched: false, expected: expect }, null, 2));
      } else {
        printProject(lastProject);
      }
      throw new Error(`Timed out waiting for ${projectRef} to reach ${expect}; last status was ${status}.`);
    }

    if (!json) {
      console.log(`${projectRef}: ${status}; waiting for ${expect}...`);
    }
    await sleep(intervalSeconds * 1000);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env[TOKEN_ENV_KEY]?.trim();
  if (!token) {
    throw new Error(`Missing ${TOKEN_ENV_KEY}.`);
  }

  if (args.expect) {
    await waitForStatus({ ...args, token });
    return;
  }

  const project = await fetchProject(args.projectRef, token);
  if (args.json) {
    console.log(JSON.stringify({ project: summarizeProject(project) }, null, 2));
  } else {
    printProject(project);
  }
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(`supabase:project:status failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
