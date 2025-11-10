import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

async function main() {
  const connectionString =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    "";

  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_URL or DATABASE_URL environment variable.");
  }

  const sql = postgres(connectionString.replace(/"/g, ""), {
    prepare: false,
  });

  const migrationsDir = path.resolve("supabase", "migrations");
  const seedPath = path.resolve("supabase", "seed.sql");

  // Apply all migration files in order
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const full = path.join(migrationsDir, file);
    const sqlText = await readFile(full, { encoding: "utf8" });
    await sql.unsafe(sqlText);
  }

  // Then seed data
  const seedSql = await readFile(seedPath, { encoding: "utf8" });
  await sql.unsafe(seedSql);

  await sql.end();
  console.log("Supabase migrations and seed applied successfully.");
}

main().catch((error) => {
  console.error("Failed to apply Supabase schema:", error);
  process.exit(1);
});
