#!/usr/bin/env node
import postgres from "postgres";

const rawUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";

if (!rawUrl) {
  console.error("Missing SUPABASE_DB_URL or DATABASE_URL environment variable.");
  process.exit(1);
}

const connectionString = rawUrl.replace(/"/g, "");
const sql = postgres(connectionString, { prepare: false });

const statements = [
  'drop policy if exists "Public read for product images" on storage.objects;',
  'drop policy if exists "Public read product images" on storage.objects;',
];

try {
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  console.log("Storage policies updated: public-read access removed.");
} catch (error) {
  console.error("Failed to update storage policies:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
