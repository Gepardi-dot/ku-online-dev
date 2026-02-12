#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const TMP_DIR = path.resolve('.tmp', 'supabase-parity');
const DEFAULT_SCHEMAS = ['public'];
const TOKEN_ENV_KEY = 'SUPABASE_ACCESS_TOKEN';
const MAX_COLUMN_DIFFS_PREVIEW = 40;
const MAX_CONSTRAINT_DIFFS_PREVIEW = 30;
const MAX_TRIGGER_DIFFS_PREVIEW = 30;

function printUsage() {
  console.log('Usage: npm run supabase:parity -- --prod-ref <ref> --staging-ref <ref>');
  console.log('Optional: --schemas public,storage --keep-dumps');
  console.log(`Requires ${TOKEN_ENV_KEY} in environment.`);
}

function parseArgs(argv) {
  const args = {
    prodRef: '',
    stagingRef: '',
    schemas: DEFAULT_SCHEMAS,
    keepDumps: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--prod-ref') {
      args.prodRef = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (current === '--staging-ref') {
      args.stagingRef = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (current === '--schemas') {
      args.schemas = (argv[i + 1] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (current === '--keep-dumps') {
      args.keepDumps = true;
      continue;
    }
    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return args;
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlSchemaList(schemas) {
  return schemas.map(sqlQuote).join(', ');
}

async function runReadOnlyQuery(projectRef, token, query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(
      `Read-only query failed for ${projectRef} with ${response.status}: ${raw.slice(0, 400)}`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected query result shape for ${projectRef}.`);
  }
  return data;
}

async function fetchSnapshot(projectRef, token, schemas) {
  const schemaList = sqlSchemaList(schemas);

  const [migrationRows, tableRows, columnRows, functionRows, policyRows, constraintRows, triggerRows] =
    await Promise.all([
    runReadOnlyQuery(
      projectRef,
      token,
      'select version from supabase_migrations.schema_migrations order by version;',
    ),
    runReadOnlyQuery(
      projectRef,
      token,
      `
      select table_schema, table_name
      from information_schema.tables
      where table_schema in (${schemaList})
        and table_type = 'BASE TABLE'
      order by table_schema, table_name;
      `,
    ),
    runReadOnlyQuery(
      projectRef,
      token,
      `
      select
        table_schema,
        table_name,
        column_name,
        data_type,
        udt_schema,
        udt_name,
        is_nullable,
        coalesce(column_default, '') as column_default
      from information_schema.columns
      where table_schema in (${schemaList})
      order by table_schema, table_name, ordinal_position;
      `,
    ),
    runReadOnlyQuery(
      projectRef,
      token,
      `
      select
        n.nspname as function_schema,
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as identity_arguments,
        pg_get_function_result(p.oid) as result_type
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in (${schemaList})
        and p.prokind = 'f'
      order by function_schema, function_name, identity_arguments;
      `,
    ),
    runReadOnlyQuery(
      projectRef,
      token,
      `
      select
        schemaname as policy_schema,
        tablename as policy_table,
        policyname as policy_name,
        cmd as policy_cmd,
        permissive as policy_permissive,
        roles as policy_roles,
        coalesce(qual, '') as policy_using,
        coalesce(with_check, '') as policy_with_check
      from pg_policies
      where schemaname in (${schemaList})
      order by policy_schema, policy_table, policy_name, policy_cmd;
      `,
    ),
    runReadOnlyQuery(
      projectRef,
      token,
      `
      select
        n.nspname as constraint_schema,
        t.relname as constraint_table,
        c.conname as constraint_name,
        c.contype as constraint_type,
        pg_get_constraintdef(c.oid, true) as constraint_def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname in (${schemaList})
      order by constraint_schema, constraint_table, constraint_name;
      `,
    ),
    runReadOnlyQuery(
      projectRef,
      token,
      `
      select
        n.nspname as trigger_schema,
        c.relname as trigger_table,
        tg.tgname as trigger_name,
        pg_get_triggerdef(tg.oid, true) as trigger_def
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in (${schemaList})
        and not tg.tgisinternal
      order by trigger_schema, trigger_table, trigger_name;
      `,
    ),
  ]);

  return {
    migrations: migrationRows.map((row) => row.version),
    tables: tableRows,
    columns: columnRows,
    functions: functionRows,
    policies: policyRows,
    constraints: constraintRows,
    triggers: triggerRows,
  };
}

function setDiff(aSet, bSet) {
  return [...aSet].filter((item) => !bSet.has(item)).sort();
}

function rowSet(rows, keyBuilder) {
  return new Set(rows.map(keyBuilder));
}

function rowMap(rows, keyBuilder, valueBuilder = (row) => row) {
  const map = new Map();
  for (const row of rows) {
    map.set(keyBuilder(row), valueBuilder(row));
  }
  return map;
}

function compareSnapshots(production, staging) {
  const migrationProd = new Set(production.migrations);
  const migrationStaging = new Set(staging.migrations);

  const tableKey = (row) => `${row.table_schema}.${row.table_name}`;
  const functionKey = (row) =>
    `${row.function_schema}.${row.function_name}(${row.identity_arguments ?? ''})`;
  const policyKey = (row) =>
    `${row.policy_schema}.${row.policy_table}.${row.policy_name}.${row.policy_cmd}`;
  const constraintKey = (row) =>
    `${row.constraint_schema}.${row.constraint_table}.${row.constraint_name}`;
  const triggerKey = (row) => `${row.trigger_schema}.${row.trigger_table}.${row.trigger_name}`;
  const columnKey = (row) => `${row.table_schema}.${row.table_name}.${row.column_name}`;

  const tableProd = rowSet(production.tables, tableKey);
  const tableStaging = rowSet(staging.tables, tableKey);

  const functionProd = rowSet(production.functions, functionKey);
  const functionStaging = rowSet(staging.functions, functionKey);

  const policyProd = rowSet(production.policies, policyKey);
  const policyStaging = rowSet(staging.policies, policyKey);

  const constraintProd = rowSet(production.constraints, constraintKey);
  const constraintStaging = rowSet(staging.constraints, constraintKey);
  const triggerProd = rowSet(production.triggers, triggerKey);
  const triggerStaging = rowSet(staging.triggers, triggerKey);

  const constraintProdMap = rowMap(production.constraints, constraintKey, (row) => ({
    type: row.constraint_type,
    definition: row.constraint_def,
  }));
  const constraintStagingMap = rowMap(staging.constraints, constraintKey, (row) => ({
    type: row.constraint_type,
    definition: row.constraint_def,
  }));
  const triggerProdMap = rowMap(production.triggers, triggerKey, (row) => ({
    definition: row.trigger_def,
  }));
  const triggerStagingMap = rowMap(staging.triggers, triggerKey, (row) => ({
    definition: row.trigger_def,
  }));

  const columnProd = rowMap(production.columns, columnKey, (row) => ({
    dataType: row.data_type,
    udtSchema: row.udt_schema,
    udtName: row.udt_name,
    nullable: row.is_nullable,
    defaultValue: row.column_default ?? '',
  }));
  const columnStaging = rowMap(staging.columns, columnKey, (row) => ({
    dataType: row.data_type,
    udtSchema: row.udt_schema,
    udtName: row.udt_name,
    nullable: row.is_nullable,
    defaultValue: row.column_default ?? '',
  }));

  const allColumnKeys = [...new Set([...columnProd.keys(), ...columnStaging.keys()])].sort();
  const missingColumnsOnStaging = [];
  const extraColumnsOnStaging = [];
  const changedColumns = [];
  const changedConstraints = [];
  const changedTriggers = [];

  for (const key of allColumnKeys) {
    const prodValue = columnProd.get(key);
    const stagingValue = columnStaging.get(key);
    if (!prodValue && stagingValue) {
      extraColumnsOnStaging.push(key);
      continue;
    }
    if (prodValue && !stagingValue) {
      missingColumnsOnStaging.push(key);
      continue;
    }
    if (!prodValue || !stagingValue) continue;

    const typeChanged =
      prodValue.udtSchema !== stagingValue.udtSchema || prodValue.udtName !== stagingValue.udtName;
    const nullableChanged = prodValue.nullable !== stagingValue.nullable;
    const defaultChanged = prodValue.defaultValue !== stagingValue.defaultValue;

    if (typeChanged || nullableChanged || defaultChanged) {
      changedColumns.push({
        key,
        production: prodValue,
        staging: stagingValue,
        changes: {
          typeChanged,
          nullableChanged,
          defaultChanged,
        },
      });
    }
  }

  for (const key of [...new Set([...constraintProdMap.keys(), ...constraintStagingMap.keys()])].sort()) {
    const prodValue = constraintProdMap.get(key);
    const stagingValue = constraintStagingMap.get(key);
    if (!prodValue || !stagingValue) continue;
    if (prodValue.type !== stagingValue.type || prodValue.definition !== stagingValue.definition) {
      changedConstraints.push({
        key,
        production: prodValue,
        staging: stagingValue,
      });
    }
  }

  for (const key of [...new Set([...triggerProdMap.keys(), ...triggerStagingMap.keys()])].sort()) {
    const prodValue = triggerProdMap.get(key);
    const stagingValue = triggerStagingMap.get(key);
    if (!prodValue || !stagingValue) continue;
    if (prodValue.definition !== stagingValue.definition) {
      changedTriggers.push({
        key,
        production: prodValue,
        staging: stagingValue,
      });
    }
  }

  return {
    migrations: {
      missingOnStaging: setDiff(migrationProd, migrationStaging),
      extraOnStaging: setDiff(migrationStaging, migrationProd),
      productionCount: migrationProd.size,
      stagingCount: migrationStaging.size,
    },
    tables: {
      missingOnStaging: setDiff(tableProd, tableStaging),
      extraOnStaging: setDiff(tableStaging, tableProd),
    },
    functions: {
      missingOnStaging: setDiff(functionProd, functionStaging),
      extraOnStaging: setDiff(functionStaging, functionProd),
    },
    policies: {
      missingOnStaging: setDiff(policyProd, policyStaging),
      extraOnStaging: setDiff(policyStaging, policyProd),
    },
    constraints: {
      missingOnStaging: setDiff(constraintProd, constraintStaging),
      extraOnStaging: setDiff(constraintStaging, constraintProd),
      changed: changedConstraints,
    },
    triggers: {
      missingOnStaging: setDiff(triggerProd, triggerStaging),
      extraOnStaging: setDiff(triggerStaging, triggerProd),
      changed: changedTriggers,
    },
    columns: {
      missingOnStaging: missingColumnsOnStaging,
      extraOnStaging: extraColumnsOnStaging,
      changed: changedColumns,
    },
  };
}

function hasDrift(diff) {
  return (
    diff.migrations.missingOnStaging.length > 0 ||
    diff.migrations.extraOnStaging.length > 0 ||
    diff.tables.missingOnStaging.length > 0 ||
    diff.tables.extraOnStaging.length > 0 ||
    diff.columns.missingOnStaging.length > 0 ||
    diff.columns.extraOnStaging.length > 0 ||
    diff.columns.changed.length > 0 ||
    diff.functions.missingOnStaging.length > 0 ||
    diff.functions.extraOnStaging.length > 0 ||
    diff.policies.missingOnStaging.length > 0 ||
    diff.policies.extraOnStaging.length > 0 ||
    diff.constraints.missingOnStaging.length > 0 ||
    diff.constraints.extraOnStaging.length > 0 ||
    diff.constraints.changed.length > 0 ||
    diff.triggers.missingOnStaging.length > 0 ||
    diff.triggers.extraOnStaging.length > 0 ||
    diff.triggers.changed.length > 0
  );
}

function printList(title, values) {
  if (!values.length) {
    console.log(`${title}: none`);
    return;
  }
  console.log(`${title} (${values.length}): ${values.join(', ')}`);
}

function formatColumnChange(change) {
  const changes = [];
  if (change.changes.typeChanged) {
    changes.push(
      `type ${change.production.udtSchema}.${change.production.udtName} vs ${change.staging.udtSchema}.${change.staging.udtName}`,
    );
  }
  if (change.changes.nullableChanged) {
    changes.push(`nullable ${change.production.nullable} vs ${change.staging.nullable}`);
  }
  if (change.changes.defaultChanged) {
    const prodDefault = change.production.defaultValue || '<none>';
    const stagingDefault = change.staging.defaultValue || '<none>';
    changes.push(`default ${prodDefault} vs ${stagingDefault}`);
  }
  return `- ${change.key}: ${changes.join('; ')}`;
}

function formatConstraintChange(change) {
  return `- ${change.key}: type ${change.production.type} vs ${change.staging.type}; definition ${change.production.definition} vs ${change.staging.definition}`;
}

function formatTriggerChange(change) {
  return `- ${change.key}: definition ${change.production.definition} vs ${change.staging.definition}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prodRef || !args.stagingRef) {
    printUsage();
    process.exit(1);
  }
  if (!args.schemas.length) {
    throw new Error('At least one schema must be provided via --schemas.');
  }

  const token = process.env[TOKEN_ENV_KEY]?.trim();
  if (!token) {
    throw new Error(`Missing ${TOKEN_ENV_KEY}. Run "supabase login" or export the token first.`);
  }

  await mkdir(TMP_DIR, { recursive: true });

  console.log(`Reading schema snapshot from production (${args.prodRef})...`);
  const production = await fetchSnapshot(args.prodRef, token, args.schemas);
  console.log(`Reading schema snapshot from staging (${args.stagingRef})...`);
  const staging = await fetchSnapshot(args.stagingRef, token, args.schemas);

  const diff = compareSnapshots(production, staging);

  const productionFile = path.join(TMP_DIR, 'production.snapshot.json');
  const stagingFile = path.join(TMP_DIR, 'staging.snapshot.json');
  const diffFile = path.join(TMP_DIR, 'parity.diff.json');

  await writeFile(productionFile, `${JSON.stringify(production, null, 2)}\n`, 'utf8');
  await writeFile(stagingFile, `${JSON.stringify(staging, null, 2)}\n`, 'utf8');
  await writeFile(diffFile, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');

  const driftDetected = hasDrift(diff);

  console.log('\n=== Parity Report ===');
  console.log(`Schemas: [${args.schemas.join(', ')}]`);
  console.log(`Schema parity: ${driftDetected ? 'DRIFT DETECTED' : 'OK'}`);
  console.log(
    `Migration versions: production ${diff.migrations.productionCount}, staging ${diff.migrations.stagingCount}`,
  );

  printList('Migration versions missing on staging', diff.migrations.missingOnStaging);
  printList('Migration versions extra on staging', diff.migrations.extraOnStaging);
  printList('Tables missing on staging', diff.tables.missingOnStaging);
  printList('Tables extra on staging', diff.tables.extraOnStaging);
  printList('Columns missing on staging', diff.columns.missingOnStaging);
  printList('Columns extra on staging', diff.columns.extraOnStaging);
  printList('Functions missing on staging', diff.functions.missingOnStaging);
  printList('Functions extra on staging', diff.functions.extraOnStaging);
  printList('Policies missing on staging', diff.policies.missingOnStaging);
  printList('Policies extra on staging', diff.policies.extraOnStaging);
  printList('Constraints missing on staging', diff.constraints.missingOnStaging);
  printList('Constraints extra on staging', diff.constraints.extraOnStaging);
  printList('Triggers missing on staging', diff.triggers.missingOnStaging);
  printList('Triggers extra on staging', diff.triggers.extraOnStaging);

  if (diff.columns.changed.length) {
    console.log(`Column definitions changed (${diff.columns.changed.length}):`);
    for (const change of diff.columns.changed.slice(0, MAX_COLUMN_DIFFS_PREVIEW)) {
      console.log(formatColumnChange(change));
    }
    if (diff.columns.changed.length > MAX_COLUMN_DIFFS_PREVIEW) {
      console.log(
        `... ${diff.columns.changed.length - MAX_COLUMN_DIFFS_PREVIEW} more column diffs. See ${path.relative(process.cwd(), diffFile)}.`,
      );
    }
  } else {
    console.log('Column definitions changed: none');
  }

  if (diff.constraints.changed.length) {
    console.log(`Constraint definitions changed (${diff.constraints.changed.length}):`);
    for (const change of diff.constraints.changed.slice(0, MAX_CONSTRAINT_DIFFS_PREVIEW)) {
      console.log(formatConstraintChange(change));
    }
    if (diff.constraints.changed.length > MAX_CONSTRAINT_DIFFS_PREVIEW) {
      console.log(
        `... ${diff.constraints.changed.length - MAX_CONSTRAINT_DIFFS_PREVIEW} more constraint diffs. See ${path.relative(process.cwd(), diffFile)}.`,
      );
    }
  } else {
    console.log('Constraint definitions changed: none');
  }

  if (diff.triggers.changed.length) {
    console.log(`Trigger definitions changed (${diff.triggers.changed.length}):`);
    for (const change of diff.triggers.changed.slice(0, MAX_TRIGGER_DIFFS_PREVIEW)) {
      console.log(formatTriggerChange(change));
    }
    if (diff.triggers.changed.length > MAX_TRIGGER_DIFFS_PREVIEW) {
      console.log(
        `... ${diff.triggers.changed.length - MAX_TRIGGER_DIFFS_PREVIEW} more trigger diffs. See ${path.relative(process.cwd(), diffFile)}.`,
      );
    }
  } else {
    console.log('Trigger definitions changed: none');
  }

  console.log(`\nArtifacts written to: ${path.relative(process.cwd(), TMP_DIR)}`);
  if (!args.keepDumps) {
    await rm(TMP_DIR, { recursive: true, force: true });
    console.log('Removed parity artifacts (use --keep-dumps to preserve).');
  }

  process.exit(driftDetected ? 2 : 0);
}

main().catch((error) => {
  console.error('Parity report failed:', error.message);
  process.exit(1);
});
