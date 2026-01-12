#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Load .env.local for local runs
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=\s*(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

const DB_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'product-images';
const APPLY = process.argv.includes('--apply');

if (!DB_URL || !URL || !KEY) {
  console.error('Missing DATABASE_URL or Supabase URL/Service key');
  process.exit(1);
}

const sql = postgres(DB_URL.replace(/"/g, ''), { prepare: false });
const supabase = createAdminClient(URL, KEY);

function toSet(rows) {
  const s = new Set();
  for (const r of rows) {
    for (const p of r.images || []) {
      if (typeof p === 'string' && p) s.add(p);
    }
  }
  return s;
}

async function main() {
  const products = await sql`select images from public.products`;
  const referenced = toSet(products);

  const { data: list, error } = await supabase.storage.from(BUCKET).list('', { limit: 10000, offset: 0, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;

  // Storage JS list() is not recursive; walk top-level prefixes (user folders)
  const folders = (list || []).filter((e) => e.id === undefined && e.name).map((e) => e.name);
  const toDelete = [];
  for (const folder of folders) {
    let offset = 0;
    while (true) {
      const { data, error: err } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (err) throw err;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        if (entry.name) {
          const full = `${folder}/${entry.name}`;
          if (!referenced.has(full)) {
            toDelete.push(full);
          }
        }
      }
      offset += data.length;
      if (data.length < 1000) break;
    }
  }

  console.log(`Found ${toDelete.length} orphaned files in ${BUCKET}`);
  if (!APPLY || toDelete.length === 0) {
    console.log('Dry run. Pass --apply to delete.');
    await sql.end();
    return;
  }

  const chunkSize = 100;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize);
    const { error: delError } = await supabase.storage.from(BUCKET).remove(chunk);
    if (delError) throw delError;
    console.log(`Deleted ${i + chunk.length}/${toDelete.length}`);
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
