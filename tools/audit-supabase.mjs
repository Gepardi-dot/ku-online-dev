import 'node:process';
import postgres from 'postgres';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const env = process.env;
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || '';
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!dbUrl) throw new Error('Missing DATABASE_URL or SUPABASE_DB_URL');
if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');

const sql = postgres(dbUrl.replace(/"/g, ''), { prepare: false });
const supabaseAdmin = serviceKey ? createAdminClient(supabaseUrl, serviceKey) : null;

function log(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function fetchJson(url, key) {
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return await res.json();
}

async function main() {
  const categories = await sql`
    select id, name, sort_order, is_active, coalesce(icon, '') as icon
    from public.categories
    order by sort_order, name
  `;
  log('Categories (before)', categories);

  const desired = [
    'smartphones',
    'electronics',
    'home & garden',
    'fashion',
    'sports',
    'cars',
    'kids & toys',
    'services',
    'motors',
    'free',
    'others',
  ];
  const orderMap = new Map(desired.map((n, i) => [n, i + 1]));

  await sql.begin(async (trx) => {
    await trx`update public.categories set is_active = false where lower(name) = 'sports & outdoors'`;
    for (const row of categories) {
      const key = String(row.name).toLowerCase();
      if (orderMap.has(key)) {
        const newOrder = orderMap.get(key);
        if (row.sort_order !== newOrder) {
          await trx`
            update public.categories
            set sort_order = ${newOrder}
            where id = ${row.id}
          `;
        }
      }
    }
  });

  const categoriesAfter = await sql`
    select id, name, sort_order, is_active
    from public.categories
    order by sort_order, name
  `;
  log('Categories (after)', categoriesAfter);

  const rls = await sql`
    select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `;
  log('RLS status', rls);

  const policies = await sql`
    select tablename, policyname, cmd, roles, permissive, qual, with_check
    from pg_policies where schemaname = 'public'
    order by tablename, policyname
  `;
  log('Policies', policies);

  const products = await fetchJson(
    `${supabaseUrl}/rest/v1/products?select=id,title,is_active,created_at&order=created_at.desc&limit=3`,
    anonKey,
  );
  log('Anon products sample', products);

  let anonMessages = [];
  try {
    anonMessages = await fetchJson(`${supabaseUrl}/rest/v1/messages?select=id&limit=1`, anonKey);
  } catch (e) {
    anonMessages = { error: String(e.message || e) };
  }
  log('Anon messages read attempt', anonMessages);

  let anonNotifications = [];
  try {
    anonNotifications = await fetchJson(`${supabaseUrl}/rest/v1/notifications?select=id&limit=1`, anonKey);
  } catch (e) {
    anonNotifications = { error: String(e.message || e) };
  }
  log('Anon notifications read attempt', anonNotifications);

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw error;
      log('Storage buckets', data ?? []);
    } catch (e) {
      log('Storage buckets (error)', String(e.message || e));
    }
  } else {
    log('Storage buckets', 'Skipped: missing SUPABASE_SERVICE_ROLE_KEY');
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
