#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const TOKEN_ENV_KEY = 'SUPABASE_ACCESS_TOKEN';

function printUsage() {
  console.log('Usage: npm run supabase:sql -- --project-ref <ref> --file <path-to-sql>');
  console.log('Optional: --read-only');
}

function parseArgs(argv) {
  const args = {
    projectRef: '',
    file: '',
    readOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--project-ref') {
      args.projectRef = (argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (current === '--file') {
      args.file = (argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (current === '--read-only') {
      args.readOnly = true;
      continue;
    }
    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return args;
}

async function runQuery(projectRef, token, sql, readOnly) {
  const endpoint = readOnly ? 'read-only' : '';
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query${endpoint ? `/${endpoint}` : ''}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`SQL apply failed with ${response.status}: ${raw.slice(0, 500)}`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectRef || !args.file) {
    printUsage();
    process.exit(1);
  }

  const token = process.env[TOKEN_ENV_KEY]?.trim();
  if (!token) {
    throw new Error(`Missing ${TOKEN_ENV_KEY}. Run "supabase login" or export the token first.`);
  }

  const absolutePath = path.resolve(args.file);
  const sql = await readFile(absolutePath, 'utf8');

  console.log(
    `${args.readOnly ? 'Running read-only SQL' : 'Applying SQL'} on project ${args.projectRef} from ${path.relative(process.cwd(), absolutePath)}...`,
  );
  const result = await runQuery(args.projectRef, token, sql, args.readOnly);
  const rowCount = Array.isArray(result) ? result.length : 0;
  console.log(`Done. Result rows: ${rowCount}`);
}

main().catch((error) => {
  console.error('supabase:sql failed:', error.message);
  process.exit(1);
});
