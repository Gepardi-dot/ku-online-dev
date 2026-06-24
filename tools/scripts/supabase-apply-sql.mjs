#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const TOKEN_ENV_KEY = 'SUPABASE_ACCESS_TOKEN';

function printUsage() {
  console.log('Usage: npm run supabase:sql -- --project-ref <ref> --file <path-to-sql> --read-only');
  console.log('Write mode requires: --confirm-write --confirm-project-ref <same-ref>');
  console.log('Migration files may add: --record-migration');
}

export function parseArgs(argv) {
  const args = {
    projectRef: '',
    confirmProjectRef: '',
    file: '',
    readOnly: false,
    confirmWrite: false,
    recordMigration: false,
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
    if (current === '--confirm-project-ref') {
      args.confirmProjectRef = (argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }
    if (current === '--read-only') {
      args.readOnly = true;
      continue;
    }
    if (current === '--confirm-write') {
      args.confirmWrite = true;
      continue;
    }
    if (current === '--record-migration') {
      args.recordMigration = true;
      continue;
    }
    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return args;
}

export function assertSqlArgsReady(args) {
  if (!args.projectRef || !args.file) {
    return false;
  }

  if (!args.readOnly) {
    if (!args.confirmWrite) {
      throw new Error('Write mode requires --confirm-write.');
    }
    if (!args.confirmProjectRef) {
      throw new Error('Write mode requires --confirm-project-ref <ref>.');
    }
    if (args.confirmProjectRef !== args.projectRef) {
      throw new Error('--confirm-project-ref must exactly match --project-ref.');
    }
  } else if (args.recordMigration) {
    throw new Error('--record-migration is only valid in write mode.');
  }

  return true;
}

export function extractMigrationMetadata(filePath) {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) {
    throw new Error('--record-migration requires a file named <14-digit-version>_<name>.sql.');
  }

  return {
    version: match[1],
    name: match[2],
  };
}

export function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function ensureStatementTerminated(sql) {
  const trimmed = sql.trimEnd();
  if (!trimmed) return '';
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
}

export function buildMigrationRecordSql({ version, name, sql }) {
  return `
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);

insert into supabase_migrations.schema_migrations (version, statements, name)
values (${sqlLiteral(version)}, array[${sqlLiteral(sql)}]::text[], ${sqlLiteral(name)})
on conflict (version) do update
set statements = excluded.statements,
    name = excluded.name;
`;
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
  if (!assertSqlArgsReady(args)) {
    printUsage();
    process.exit(1);
  }

  const token = process.env[TOKEN_ENV_KEY]?.trim();
  if (!token) {
    throw new Error(`Missing ${TOKEN_ENV_KEY}. Run "supabase login" or export the token first.`);
  }

  const absolutePath = path.resolve(args.file);
  const sql = await readFile(absolutePath, 'utf8');
  const migrationMetadata = args.recordMigration ? extractMigrationMetadata(absolutePath) : null;
  const sqlToRun = migrationMetadata
    ? `${ensureStatementTerminated(sql)}\n\n${buildMigrationRecordSql({ ...migrationMetadata, sql })}`
    : sql;

  console.log(
    `${args.readOnly ? 'Running read-only SQL' : 'Applying SQL'} on project ${args.projectRef} from ${path.relative(process.cwd(), absolutePath)}...`,
  );
  const result = await runQuery(args.projectRef, token, sqlToRun, args.readOnly);
  const rowCount = Array.isArray(result) ? result.length : 0;
  const migrationMessage = migrationMetadata ? ` Migration ${migrationMetadata.version} recorded.` : '';
  console.log(`Done. Result rows: ${rowCount}.${migrationMessage}`);
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error('supabase:sql failed:', error.message);
    process.exit(1);
  });
}
