import 'node:process';

const token = process.env.ADMIN_REVALIDATE_TOKEN;
const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5000';

if (!token) {
  console.error('Missing ADMIN_REVALIDATE_TOKEN in environment.');
  process.exit(1);
}

async function call(scope = 'categories', paths = []) {
  const res = await fetch(`${base}/api/admin/revalidate`, {
    method: 'POST',
    headers: {
      'x-admin-token': token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ scope, paths }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(res.status, res.statusText, text);
    process.exit(1);
  }
  console.log(text);
}

call(process.argv[2] || 'categories', process.argv[3] ? process.argv[3].split(',') : []);

