import 'node:process';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'product-images';

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function fetchJson(method, path, body) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return data;
}

async function main() {
  // List buckets (some projects require singular /bucket)
  let buckets = null;
  try {
    buckets = await fetchJson('GET', '/storage/v1/buckets');
  } catch (e) {
    // try singular
    try {
      buckets = await fetchJson('GET', '/storage/v1/bucket');
    } catch (e2) {
      console.error('Failed to list buckets:', String(e2.message || e2));
    }
  }

  if (Array.isArray(buckets)) {
    const exists = buckets.some((b) => b.name === bucketName);
    if (exists) {
      console.log(`Bucket '${bucketName}' already exists.`);
      return;
    }
  }

  // Create bucket (singular endpoint)
  try {
    const created = await fetchJson('POST', '/storage/v1/bucket', { name: bucketName, public: false });
    console.log('Created bucket:', created);
  } catch (e) {
    console.error('Create bucket failed:', String(e.message || e));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
