import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSqlArgsReady,
  buildMigrationRecordSql,
  ensureStatementTerminated,
  extractMigrationMetadata,
  parseArgs,
  sqlLiteral,
} from '../supabase-apply-sql.mjs';

test('read-only SQL mode does not require destructive-write confirmations', () => {
  const args = parseArgs([
    '--project-ref',
    'kvmbtbhlapjlhfppomsw',
    '--file',
    'supabase/migrations/repair.sql',
    '--read-only',
  ]);

  assert.equal(args.readOnly, true);
  assert.equal(args.confirmWrite, false);
  assert.equal(assertSqlArgsReady(args), true);
});

test('write SQL mode requires explicit write confirmation', () => {
  const args = parseArgs([
    '--project-ref',
    'kvmbtbhlapjlhfppomsw',
    '--file',
    'supabase/migrations/repair.sql',
  ]);

  assert.throws(() => assertSqlArgsReady(args), /--confirm-write/);
});

test('write SQL mode requires matching project confirmation', () => {
  const args = parseArgs([
    '--project-ref',
    'kvmbtbhlapjlhfppomsw',
    '--confirm-write',
    '--confirm-project-ref',
    'wrong-project',
    '--file',
    'supabase/migrations/repair.sql',
  ]);

  assert.throws(() => assertSqlArgsReady(args), /exactly match/);
});

test('write SQL mode passes only when both project refs match', () => {
  const args = parseArgs([
    '--project-ref',
    'kvmbtbhlapjlhfppomsw',
    '--confirm-write',
    '--confirm-project-ref',
    'kvmbtbhlapjlhfppomsw',
    '--file',
    'supabase/migrations/20260623152000_repair_secure_rpc_parity.sql',
    '--record-migration',
  ]);

  assert.equal(args.recordMigration, true);
  assert.equal(assertSqlArgsReady(args), true);
});

test('missing required SQL inputs are reported before token lookup', () => {
  const args = parseArgs([]);

  assert.equal(assertSqlArgsReady(args), false);
});

test('migration recording is only valid in write mode', () => {
  const args = parseArgs([
    '--project-ref',
    'kvmbtbhlapjlhfppomsw',
    '--file',
    'supabase/migrations/20260623152000_repair_secure_rpc_parity.sql',
    '--read-only',
    '--record-migration',
  ]);

  assert.throws(() => assertSqlArgsReady(args), /only valid in write mode/);
});

test('extractMigrationMetadata parses Supabase migration filenames', () => {
  assert.deepEqual(
    extractMigrationMetadata('supabase/migrations/20260623152000_repair_secure_rpc_parity.sql'),
    {
      version: '20260623152000',
      name: 'repair_secure_rpc_parity',
    },
  );
  assert.throws(() => extractMigrationMetadata('supabase/migrations/repair.sql'), /14-digit-version/);
});

test('migration record SQL safely quotes migration metadata and SQL body', () => {
  assert.equal(sqlLiteral("one's"), "'one''s'");
  assert.equal(ensureStatementTerminated('select 1'), 'select 1;');
  assert.equal(ensureStatementTerminated('select 1;'), 'select 1;');

  const sql = buildMigrationRecordSql({
    version: '20260623152000',
    name: "repair's_name",
    sql: "select 'ok';",
  });

  assert.match(sql, /create schema if not exists supabase_migrations/);
  assert.match(sql, /insert into supabase_migrations\.schema_migrations/);
  assert.match(sql, /'20260623152000'/);
  assert.match(sql, /'repair''s_name'/);
  assert.match(sql, /'select ''ok'';'/);
});
