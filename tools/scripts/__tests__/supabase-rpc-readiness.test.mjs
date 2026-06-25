import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectedMigrationsSql,
  expectedFunctionsSql,
  expectedSearchRpcSql,
  hasBrokenAlgoliaSecureRpcDefinition,
  hasReadinessFailures,
  missingMigrationRows,
  parseArgs,
  sqlString,
} from '../supabase-rpc-readiness.mjs';

test('RPC readiness parser checks production and staging by default', () => {
  const args = parseArgs([]);

  assert.deepEqual(args.projectRefs, ['kvmbtbhlapjlhfppomsw', 'cuotmvhhgakjeqdsfziu']);
  assert.equal(args.json, false);
});

test('RPC readiness parser deduplicates explicit project refs', () => {
  const args = parseArgs([
    '--project-ref',
    'project-a',
    '--project-ref',
    'project-a',
    '--project-ref',
    'project-b',
    '--json',
  ]);

  assert.deepEqual(args.projectRefs, ['project-a', 'project-b']);
  assert.equal(args.json, true);
});

test('readiness SQL safely escapes literal values', () => {
  assert.equal(sqlString("listing's mode"), "'listing''s mode'");
});

test('expected secure RPC SQL includes the production PGRST202 repair target', () => {
  const sql = expectedFunctionsSql();

  assert.match(sql, /list_conversation_summaries_secure/);
  assert.match(sql, /get_algolia_product_row_secure/);
});

test('expected search RPC SQL requires legacy and listing-mode signatures', () => {
  const sql = expectedSearchRpcSql();

  assert.match(sql, /search_products/);
  assert.match(sql, /search_products_semantic/);
  assert.match(sql, /listing-mode/);
  assert.match(sql, /legacy/);
});

test('expected migration SQL requires both P0 repair migrations', () => {
  const sql = expectedMigrationsSql();

  assert.match(sql, /20260623152000/);
  assert.match(sql, /20260624143000/);
  assert.match(sql, /20260625104000/);
});

test('blank project migration fallback marks required migrations missing', () => {
  assert.deepEqual(missingMigrationRows(), [
    { version: '20260623152000', exists: false },
    { version: '20260624143000', exists: false },
    { version: '20260625104000', exists: false },
  ]);
});

test('Algolia secure RPC guard detects broken dynamic SELECT INTO body', () => {
  assert.equal(hasBrokenAlgoliaSecureRpcDefinition(`
    execute format($fmt$
      select p.seller_id, jsonb_build_object('id', p.id)
      into v_seller_id, v_row
      from public.products p
    $fmt$)
    into v_seller_id, v_row;
  `), true);

  assert.equal(hasBrokenAlgoliaSecureRpcDefinition(`
    select p.seller_id, jsonb_build_object('id', p.id)
    into v_seller_id, v_row
    from public.products p;
  `), false);
});

test('readiness failure detection is based on report errors', () => {
  assert.equal(hasReadinessFailures([{ errors: [] }]), false);
  assert.equal(hasReadinessFailures([{ errors: ['missing rpc'] }]), true);
});
