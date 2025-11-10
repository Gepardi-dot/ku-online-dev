import postgres from 'postgres';
import process from 'node:process';

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
  if (!connectionString) throw new Error('Missing SUPABASE_DB_URL or DATABASE_URL');

  const sql = postgres(connectionString.replace(/"/g, ''), { prepare: false });
  try {
    await sql.begin(async (trx) => {
      const existsHomeGarden = await trx`
        select 1 from public.categories where lower(name) = 'home & garden' limit 1
      `;
      if (existsHomeGarden.length > 0) {
        await trx`update public.categories set is_active = true where lower(name) = 'home & garden'`;
        await trx`update public.categories set is_active = false where lower(name) = 'home & living'`;
      } else {
        await trx`update public.categories set name = 'Home & Garden' where lower(name) = 'home & living'`;
      }
    });
  } finally {
    await sql.end();
  }
  console.log('Category rename applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

