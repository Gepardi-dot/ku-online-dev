import { readFile } from "node:fs/promises";
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

  const migrationPath = path.resolve(
    "supabase",
    "migrations",
    "20241007160000_init_core.sql",
  );
  const seedPath = path.resolve("supabase", "seed.sql");

  const migrationSql = await readFile(migrationPath, { encoding: "utf8" });
  const seedSql = await readFile(seedPath, { encoding: "utf8" });

  await sql.unsafe(migrationSql);
  await sql.unsafe(seedSql);

  await sql.end();
  console.log("Supabase schema and seed applied successfully.");
}

main().catch((error) => {
  console.error("Failed to apply Supabase schema:", error);
  process.exit(1);
});
