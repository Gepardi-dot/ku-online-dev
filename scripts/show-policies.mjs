import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";

if (!connectionString) {
  throw new Error("Missing SUPABASE_DB_URL or DATABASE_URL environment variable.");
}

const sql = postgres(connectionString.replace(/"/g, ""), { prepare: false });

const policies = await sql`
  select schemaname, tablename, policyname, cmd
  from pg_policies
  where schemaname in ('public', 'storage')
  order by schemaname, tablename, policyname;
`;

console.table(policies);

await sql.end();
