import postgres from "postgres";
import process from "node:process";

async function main() {
  const connectionString =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    "";

  if (!connectionString) {
    console.error("Missing SUPABASE_DB_URL or DATABASE_URL environment variable.");
    process.exit(1);
  }

  const sql = postgres(connectionString.replace(/"/g, ""), {
    prepare: false,
  });

  try {
    const [row] = await sql/* sql */`select to_regclass('public.review_helpful') as exists`;
    if (!row || !row.exists) {
      console.log("review_helpful table is missing.");
    } else {
      console.log("review_helpful table exists:", row.exists);
    }
  } catch (error) {
    console.error("Error while checking review_helpful table:", error);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Unexpected failure in check-review-helpful:", error);
  process.exit(1);
});

