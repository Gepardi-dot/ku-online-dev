#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const TOKEN_ENV_KEY = 'SUPABASE_ACCESS_TOKEN';
const DEFAULT_PROD_REF = 'kvmbtbhlapjlhfppomsw';
const DEFAULT_STAGING_REF = 'cuotmvhhgakjeqdsfziu';

const REQUIRED_FUNCTIONS = [
  ['list_conversation_messages_secure', 'uuid, timestamp with time zone, integer'],
  ['get_conversation_detail_secure', 'uuid'],
  ['list_conversation_summaries_secure', ''],
  ['mark_conversation_read_secure', 'uuid'],
  ['delete_message_secure', 'uuid'],
  ['delete_conversation_secure', 'uuid'],
  ['get_algolia_product_row_secure', 'uuid'],
];

const SEARCH_RPC_SIGNATURES = [
  {
    functionName: 'search_products',
    argumentTypes: 'text, uuid, numeric, numeric, text, integer, integer',
    kind: 'legacy',
    requiresListingFields: false,
  },
  {
    functionName: 'search_products',
    argumentTypes: 'text, uuid, text, text, numeric, numeric, text, integer, integer',
    kind: 'listing-mode',
    requiresListingFields: true,
  },
  {
    functionName: 'search_products_semantic',
    argumentTypes: 'text, vector, uuid, numeric, numeric, text, integer, integer',
    kind: 'legacy',
    requiresListingFields: false,
  },
  {
    functionName: 'search_products_semantic',
    argumentTypes: 'text, vector, uuid, text, text, numeric, numeric, text, integer, integer',
    kind: 'listing-mode',
    requiresListingFields: true,
  },
];

const REQUIRED_LISTING_MODE_CONSTRAINTS = [
  'products_listing_type_valid',
  'products_rental_term_listing_type_match',
  'products_rental_term_valid',
];

const REQUIRED_MIGRATIONS = [
  '20260623152000',
  '20260624143000',
  '20260625104000',
];

function printUsage() {
  console.log('Usage: node tools/scripts/supabase-rpc-readiness.mjs [--prod-ref <ref>] [--staging-ref <ref>] [--project-ref <ref>] [--json]');
  console.log('Requires SUPABASE_ACCESS_TOKEN. Uses read-only SQL only.');
}

export function parseArgs(argv) {
  const args = {
    prodRef: DEFAULT_PROD_REF,
    stagingRef: DEFAULT_STAGING_REF,
    projectRefs: [],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--prod-ref') {
      args.prodRef = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (current === '--staging-ref') {
      args.stagingRef = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (current === '--project-ref') {
      const value = (argv[index + 1] ?? '').trim();
      if (value) args.projectRefs.push(value);
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

  if (args.projectRefs.length === 0) {
    args.projectRefs = [args.prodRef, args.stagingRef].filter(Boolean);
  }

  args.projectRefs = [...new Set(args.projectRefs)];
  return args;
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status}: ${raw.slice(0, 500)}`);
  }

  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

async function getProject(projectRef, token) {
  return requestJson(`https://api.supabase.com/v1/projects/${projectRef}`, token);
}

async function runReadOnlyQuery(projectRef, token, query) {
  const data = await requestJson(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ query }),
    },
  );

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected read-only SQL response for ${projectRef}.`);
  }

  return data;
}

export function expectedFunctionsSql() {
  return REQUIRED_FUNCTIONS.map(
    ([functionName, argumentTypes]) =>
      `(${sqlString(functionName)}, ${sqlString(argumentTypes)}, true)`,
  ).join(',\n    ');
}

export function expectedSearchRpcSql() {
  return SEARCH_RPC_SIGNATURES.map(
    ({ functionName, argumentTypes, kind, requiresListingFields }) =>
      `(${sqlString(functionName)}, ${sqlString(argumentTypes)}, ${sqlString(kind)}, ${requiresListingFields ? 'true' : 'false'})`,
  ).join(',\n    ');
}

export function expectedMigrationsSql() {
  return REQUIRED_MIGRATIONS.map((version) => `(${sqlString(version)})`).join(',\n        ');
}

export function missingMigrationRows() {
  return REQUIRED_MIGRATIONS.map((version) => ({
    version,
    exists: false,
  }));
}

export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function hasBrokenAlgoliaSecureRpcDefinition(functionDef) {
  const value = String(functionDef ?? '');
  return (
    /execute\s+format\s*\(/i.test(value) &&
    /into\s+v_seller_id\s*,\s*v_row\s+from\s+public\.products/i.test(value)
  );
}

async function inspectProject(projectRef, token) {
  const project = await getProject(projectRef, token);
  const report = {
    ref: projectRef,
    name: project?.name ?? '',
    status: project?.status ?? 'unknown',
    database: project?.database ?? null,
    checks: {
      projectActive: project?.status === 'ACTIVE_HEALTHY',
      readOnlySql: false,
      requiredFunctions: [],
      productImagesColumn: null,
      productListingModeColumns: [],
      productListingModeConstraints: [],
      productListingModeIndexes: [],
      searchRpcSignatures: [],
      algoliaProductRowFunction: null,
      requiredMigrations: [],
      migrationPresent: false,
      migrationTablePresent: false,
    },
    errors: [],
  };

  if (project?.status !== 'ACTIVE_HEALTHY') {
    report.errors.push(`Project status is ${project?.status ?? 'unknown'}.`);
    return report;
  }

  const functionRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    with expected(function_name, argument_types, should_be_security_definer) as (
      values
        ${expectedFunctionsSql()}
    )
    select
      e.function_name,
      e.argument_types,
      p.oid is not null as exists,
      coalesce(p.prosecdef, false) as security_definer,
      coalesce(l.lanname, '') as language,
      case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
      case when p.oid is null then false else has_function_privilege('public', p.oid, 'EXECUTE') end as public_execute,
      case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute,
      case when p.oid is null then false else has_function_privilege('service_role', p.oid, 'EXECUTE') end as service_role_execute
    from expected e
    left join pg_namespace n
      on n.nspname = 'public'
    left join pg_proc p
      on p.pronamespace = n.oid
     and p.proname = e.function_name
     and oidvectortypes(p.proargtypes) = e.argument_types
    left join pg_language l
      on l.oid = p.prolang
    order by e.function_name;
    `,
  );

  const columnRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    select
      column_name,
      data_type,
      udt_name,
      is_nullable,
      coalesce(column_default, '') as column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name in ('listing_type', 'rental_term')
    order by column_name;
    `,
  );

  const imageColumnRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    select
      column_name,
      data_type,
      udt_name,
      is_nullable,
      coalesce(column_default, '') as column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'images'
    limit 1;
    `,
  );

  const constraintRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    select
      c.conname,
      pg_get_constraintdef(c.oid) as definition,
      c.convalidated
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'products'
      and c.conname in (
        'products_listing_type_valid',
        'products_rental_term_listing_type_match',
        'products_rental_term_valid'
      )
    order by c.conname;
    `,
  );

  const indexRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    select
      indexname,
      indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'products'
      and indexdef ilike '%listing_type%'
      and indexdef ilike '%rental_term%'
    order by indexname;
    `,
  );

  const searchRpcRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    with expected(function_name, argument_types, kind, requires_listing_fields) as (
      values
        ${expectedSearchRpcSql()}
    )
    select
      e.function_name,
      e.argument_types,
      e.kind,
      e.requires_listing_fields,
      p.oid is not null as exists,
      coalesce(pg_get_function_result(p.oid), '') as result_type,
      case
        when p.oid is null then false
        else pg_get_function_result(p.oid) ilike '%listing_type text%'
          and pg_get_function_result(p.oid) ilike '%rental_term text%'
      end as returns_listing_fields,
      case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
      case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute
    from expected e
    left join pg_namespace n
      on n.nspname = 'public'
    left join pg_proc p
      on p.pronamespace = n.oid
     and p.proname = e.function_name
     and oidvectortypes(p.proargtypes) = e.argument_types
    order by e.function_name, e.kind;
    `,
  );

  const algoliaFunctionRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    select
      p.oid is not null as exists,
      case when p.oid is null then '' else pg_get_functiondef(p.oid) end as function_def
    from (values ('get_algolia_product_row_secure', 'uuid')) e(function_name, argument_types)
    left join pg_namespace n
      on n.nspname = 'public'
    left join pg_proc p
      on p.pronamespace = n.oid
     and p.proname = e.function_name
     and oidvectortypes(p.proargtypes) = e.argument_types;
    `,
  );

  const migrationTableRows = await runReadOnlyQuery(
    projectRef,
    token,
    `
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'supabase_migrations'
        and table_name = 'schema_migrations'
    ) as exists;
    `,
  );

  const migrationTablePresent = migrationTableRows.some((row) => row.exists === true);
  const migrationRows = migrationTablePresent ? await runReadOnlyQuery(
    projectRef,
    token,
    `
    with expected(version) as (
      values
        ${expectedMigrationsSql()}
    )
    select
      e.version,
      m.version is not null as exists
    from expected e
    left join supabase_migrations.schema_migrations m
      on m.version = e.version
    order by e.version;
    `,
  ) : missingMigrationRows();

  report.checks.readOnlySql = true;
  report.checks.requiredFunctions = functionRows;
  report.checks.productImagesColumn = imageColumnRows[0] ?? null;
  report.checks.productListingModeColumns = columnRows;
  report.checks.productListingModeConstraints = constraintRows;
  report.checks.productListingModeIndexes = indexRows;
  report.checks.searchRpcSignatures = searchRpcRows;
  report.checks.algoliaProductRowFunction = algoliaFunctionRows[0] ?? null;
  report.checks.requiredMigrations = migrationRows;
  report.checks.migrationPresent = migrationRows.length > 0 && migrationRows.every((row) => row.exists);
  report.checks.migrationTablePresent = migrationTablePresent;

  if (!migrationTablePresent) {
    report.errors.push('Missing supabase_migrations.schema_migrations table.');
  }

  for (const row of functionRows) {
    if (!row.exists) {
      report.errors.push(`Missing function public.${row.function_name}(${row.argument_types}).`);
      continue;
    }
    if (!row.security_definer) {
      report.errors.push(`Function public.${row.function_name} is not SECURITY DEFINER.`);
    }
    if (row.anon_execute) {
      report.errors.push(`Function public.${row.function_name} is executable by anon.`);
    }
    if (row.public_execute) {
      report.errors.push(`Function public.${row.function_name} is executable by public.`);
    }
    if (!row.authenticated_execute) {
      report.errors.push(`Function public.${row.function_name} is not executable by authenticated.`);
    }
    if (!row.service_role_execute) {
      report.errors.push(`Function public.${row.function_name} is not executable by service_role.`);
    }
  }

  const listingColumns = new Set(columnRows.map((row) => row.column_name));
  if (!listingColumns.has('listing_type')) {
    report.errors.push('Missing products.listing_type column.');
  }
  if (!listingColumns.has('rental_term')) {
    report.errors.push('Missing products.rental_term column.');
  }

  const listingTypeColumn = columnRows.find((row) => row.column_name === 'listing_type');
  if (listingTypeColumn) {
    if (listingTypeColumn.data_type !== 'text') {
      report.errors.push(`products.listing_type is ${listingTypeColumn.data_type}, expected text.`);
    }
    if (listingTypeColumn.is_nullable !== 'NO') {
      report.errors.push('products.listing_type is nullable; expected NOT NULL.');
    }
    if (!String(listingTypeColumn.column_default ?? '').includes("'sale'")) {
      report.errors.push('products.listing_type default is not sale.');
    }
  }

  const rentalTermColumn = columnRows.find((row) => row.column_name === 'rental_term');
  if (rentalTermColumn && rentalTermColumn.data_type !== 'text') {
    report.errors.push(`products.rental_term is ${rentalTermColumn.data_type}, expected text.`);
  }

  const imagesColumn = report.checks.productImagesColumn;
  if (!imagesColumn) {
    report.errors.push('Missing products.images column.');
  } else if (
    !(
      imagesColumn.udt_name === '_text' ||
      imagesColumn.udt_name === 'jsonb'
    )
  ) {
    report.errors.push(`products.images has unsupported type ${imagesColumn.udt_name}; expected text[] or jsonb.`);
  }

  const constraints = new Map(constraintRows.map((row) => [row.conname, row]));
  for (const constraintName of REQUIRED_LISTING_MODE_CONSTRAINTS) {
    const constraint = constraints.get(constraintName);
    if (!constraint) {
      report.errors.push(`Missing products constraint ${constraintName}.`);
      continue;
    }
    if (!constraint.convalidated) {
      report.errors.push(`Products constraint ${constraintName} is not validated.`);
    }
  }

  const hasListingModeIndex = indexRows.some((row) => {
    const indexDef = String(row.indexdef ?? '').toLowerCase();
    return (
      indexDef.includes('category_id') &&
      indexDef.includes('listing_type') &&
      indexDef.includes('rental_term') &&
      indexDef.includes('created_at') &&
      indexDef.includes('is_active') &&
      indexDef.includes('is_sold')
    );
  });
  if (!hasListingModeIndex) {
    report.errors.push('Missing active/unsold category/listing_type/rental_term/created_at product index.');
  }

  for (const row of searchRpcRows) {
    if (!row.exists) {
      report.errors.push(`Missing ${row.kind} search RPC public.${row.function_name}(${row.argument_types}).`);
      continue;
    }
    if (row.requires_listing_fields && !row.returns_listing_fields) {
      report.errors.push(`Search RPC public.${row.function_name}(${row.argument_types}) does not return listing_type/rental_term.`);
    }
    if (!row.anon_execute) {
      report.errors.push(`Search RPC public.${row.function_name}(${row.argument_types}) is not executable by anon.`);
    }
    if (!row.authenticated_execute) {
      report.errors.push(`Search RPC public.${row.function_name}(${row.argument_types}) is not executable by authenticated.`);
    }
  }

  const algoliaFunction = report.checks.algoliaProductRowFunction;
  if (!algoliaFunction?.exists) {
    report.errors.push('Missing public.get_algolia_product_row_secure(uuid) function definition.');
  } else if (hasBrokenAlgoliaSecureRpcDefinition(algoliaFunction.function_def)) {
    report.errors.push('public.get_algolia_product_row_secure(uuid) contains broken dynamic SELECT INTO syntax.');
  }

  for (const row of migrationRows) {
    if (!row.exists) {
      report.errors.push(`Migration ${row.version} is not recorded.`);
    }
  }

  return report;
}

function printHumanReport(reports) {
  for (const report of reports) {
    console.log(`${report.ref} (${report.name || 'unknown'}): ${report.status}`);
    console.log(`  project active: ${report.checks.projectActive ? 'yes' : 'no'}`);
    console.log(`  read-only sql: ${report.checks.readOnlySql ? 'yes' : 'no'}`);
    if (report.checks.requiredMigrations.length) {
      const present = report.checks.requiredMigrations.filter((row) => row.exists).length;
      const total = report.checks.requiredMigrations.length;
      console.log(`  required migrations: ${present}/${total} present`);
    } else {
      console.log('  required migrations: unavailable');
    }
    if (report.checks.requiredFunctions.length) {
      const missing = report.checks.requiredFunctions.filter((row) => !row.exists).length;
      const total = report.checks.requiredFunctions.length;
      console.log(`  secure RPCs: ${total - missing}/${total} present`);
    }
    if (report.checks.productListingModeColumns.length) {
      const columns = report.checks.productListingModeColumns.map((row) => row.column_name).join(', ');
      console.log(`  listing-mode columns: ${columns}`);
    } else {
      console.log('  listing-mode columns: missing');
    }
    if (report.checks.productImagesColumn) {
      const imageColumn = report.checks.productImagesColumn;
      console.log(`  products.images type: ${imageColumn.udt_name}`);
    } else {
      console.log('  products.images type: missing');
    }
    console.log(`  listing-mode constraints: ${report.checks.productListingModeConstraints.length}/${REQUIRED_LISTING_MODE_CONSTRAINTS.length} present`);
    console.log(`  listing-mode indexes: ${report.checks.productListingModeIndexes.length} candidate(s)`);
    if (report.checks.searchRpcSignatures.length) {
      const present = report.checks.searchRpcSignatures.filter((row) => row.exists).length;
      const total = report.checks.searchRpcSignatures.length;
      console.log(`  search RPC signatures: ${present}/${total} present`);
    }
    if (report.checks.algoliaProductRowFunction) {
      const status = hasBrokenAlgoliaSecureRpcDefinition(report.checks.algoliaProductRowFunction.function_def)
        ? 'broken dynamic SELECT INTO'
        : 'ok';
      console.log(`  algolia product-row RPC body: ${status}`);
    }
    if (report.errors.length) {
      console.log('  issues:');
      for (const issue of report.errors) {
        console.log(`    - ${issue}`);
      }
    } else {
      console.log('  issues: none');
    }
  }
}

export function hasReadinessFailures(reports) {
  return reports.some((report) => report.errors.length > 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env[TOKEN_ENV_KEY]?.trim();
  if (!token) {
    throw new Error(`Missing ${TOKEN_ENV_KEY}.`);
  }

  const reports = [];
  for (const projectRef of args.projectRefs) {
    try {
      reports.push(await inspectProject(projectRef, token));
    } catch (error) {
      reports.push({
        ref: projectRef,
        name: '',
        status: 'unknown',
        checks: {
          projectActive: false,
          readOnlySql: false,
          requiredFunctions: [],
          productImagesColumn: null,
          productListingModeColumns: [],
          productListingModeConstraints: [],
          productListingModeIndexes: [],
          searchRpcSignatures: [],
          algoliaProductRowFunction: null,
          requiredMigrations: [],
          migrationPresent: false,
          migrationTablePresent: false,
        },
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ reports }, null, 2));
  } else {
    printHumanReport(reports);
  }

  const failed = hasReadinessFailures(reports);
  process.exit(failed ? 1 : 0);
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(`supabase:rpc:readiness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
