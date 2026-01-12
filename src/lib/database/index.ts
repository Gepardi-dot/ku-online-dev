import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Fix the DATABASE_URL format by removing quotes
const connectionString = process.env.DATABASE_URL?.replace(/"/g, '') || '';

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });

export * from './schema';