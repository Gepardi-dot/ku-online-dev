export async function createClient() {
  const client = globalThis.__supabaseClientMock;
  if (!client) {
    throw new Error('Supabase client mock not set. Did you forget to assign globalThis.__supabaseClientMock?');
  }
  return client;
}
