#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

const rawUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '';
if (!rawUrl) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL');
  process.exit(1);
}
const sql = postgres(rawUrl.replace(/"/g, ''), { prepare: false });

async function main() {
  const migrationsDir = path.resolve('supabase', 'migrations');
  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const full = path.join(migrationsDir, file);
    const sqlText = await readFile(full, 'utf8');
    console.log(`\n>>> Applying: ${file}`);
    try {
      await sql.unsafe(sqlText);
      console.log(`OK: ${file}`);
    } catch (err) {
      console.error(`FAILED: ${file}`);
      console.error(err);
      await sql.end();
      process.exit(1);
    }
  }
  await sql.end();
  console.log('\nAll migrations applied.');
}

main().catch((e) => { console.error(e); process.exit(1); });

