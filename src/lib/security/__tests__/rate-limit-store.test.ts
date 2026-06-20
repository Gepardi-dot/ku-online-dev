import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  checkFixedWindowRateLimit,
  getRateLimitBackendConfigStatus,
  normalizeRateLimitKey,
  resetRateLimitMemoryForTests,
} from '../rate-limit-store.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const originalKvUrl = process.env.KV_REST_API_URL;
const originalKvToken = process.env.KV_REST_API_TOKEN;
const originalWarn = console.warn;

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  console.warn = () => undefined;
  globalThis.fetch = originalFetch;
  resetRateLimitMemoryForTests();
});

afterEach(() => {
  if (originalUrl === undefined) {
    delete process.env.UPSTASH_REDIS_REST_URL;
  } else {
    process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  }

  if (originalToken === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }

  if (originalKvUrl === undefined) {
    delete process.env.KV_REST_API_URL;
  } else {
    process.env.KV_REST_API_URL = originalKvUrl;
  }

  if (originalKvToken === undefined) {
    delete process.env.KV_REST_API_TOKEN;
  } else {
    process.env.KV_REST_API_TOKEN = originalKvToken;
  }

  console.warn = originalWarn;
  globalThis.fetch = originalFetch;
  resetRateLimitMemoryForTests();
});

test('memory backend enforces a fixed window limit', async () => {
  const first = await checkFixedWindowRateLimit({
    key: 'upload:user:user-1',
    windowMs: 60_000,
    limit: 2,
    now: 1_000,
  });
  const second = await checkFixedWindowRateLimit({
    key: 'upload:user:user-1',
    windowMs: 60_000,
    limit: 2,
    now: 2_000,
  });
  const third = await checkFixedWindowRateLimit({
    key: 'upload:user:user-1',
    windowMs: 60_000,
    limit: 2,
    now: 3_000,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(first.backend, 'memory');
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  if (third.allowed) return;
  assert.equal(third.retryAfterSeconds, 58);
});

test('memory backend resets after the fixed window expires', async () => {
  await checkFixedWindowRateLimit({ key: 'messages:user:user-1', windowMs: 10_000, limit: 1, now: 1_000 });
  const blocked = await checkFixedWindowRateLimit({ key: 'messages:user:user-1', windowMs: 10_000, limit: 1, now: 2_000 });
  const afterReset = await checkFixedWindowRateLimit({
    key: 'messages:user:user-1',
    windowMs: 10_000,
    limit: 1,
    now: 12_000,
  });

  assert.equal(blocked.allowed, false);
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.remaining, 0);
});

test('normalizes rate-limit keys without leaking raw identifiers', () => {
  const normalized = normalizeRateLimitKey('Upload IP: user@example.com / 2001:db8::1');

  assert.match(normalized, /^ku-bazar:rate-limit:v1:/);
  assert.equal(normalized.includes('@'), false);
  assert.equal(normalized.includes('/'), false);
  assert.equal(normalized.length < 140, true);
});

test('reports memory backend config when Redis env is absent', () => {
  assert.deepEqual(getRateLimitBackendConfigStatus(), { configured: false, source: 'memory' });
});

test('prefers explicit Upstash env over Vercel KV env', () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.KV_REST_API_URL = 'https://kv.example.com';
  process.env.KV_REST_API_TOKEN = 'kv-token';

  assert.deepEqual(getRateLimitBackendConfigStatus(), { configured: true, source: 'upstash' });
});

test('reports Vercel KV backend config when only KV env is present', () => {
  process.env.KV_REST_API_URL = 'https://kv.example.com';
  process.env.KV_REST_API_TOKEN = 'kv-token';

  assert.deepEqual(getRateLimitBackendConfigStatus(), { configured: true, source: 'vercel-kv' });
});

test('uses Upstash REST when configured', async () => {
  const requests: Array<{ url: string; body: unknown; authorization: string | null }> = [];
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com/';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  globalThis.fetch = (async (url, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      authorization: headers.get('authorization'),
    });
    return new Response(JSON.stringify({ result: [1, 2_500] }), { status: 200 });
  }) as typeof fetch;

  const result = await checkFixedWindowRateLimit({
    key: 'favorites:user:user-1',
    windowMs: 5_000,
    limit: 2,
    now: 1_000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.backend, 'upstash');
  assert.equal(result.remaining, 1);
  assert.equal(result.resetAt, 3_500);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'https://redis.example.com');
  assert.equal(requests[0]?.authorization, 'Bearer test-token');
  assert.equal(Array.isArray(requests[0]?.body), true);
  assert.equal((requests[0]?.body as unknown[])[0], 'EVAL');
  assert.match(String((requests[0]?.body as unknown[])[3]), /^ku-bazar:rate-limit:v1:/);
});

test('uses Vercel KV REST env names when explicit Upstash env is absent', async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  process.env.KV_REST_API_URL = 'https://kv.example.com/';
  process.env.KV_REST_API_TOKEN = 'kv-token';
  globalThis.fetch = (async (url, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(url),
      authorization: headers.get('authorization'),
    });
    return new Response(JSON.stringify({ result: [1, 1_500] }), { status: 200 });
  }) as typeof fetch;

  const result = await checkFixedWindowRateLimit({
    key: 'favorites:user:user-2',
    windowMs: 5_000,
    limit: 2,
    now: 1_000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.backend, 'upstash');
  assert.equal(result.remaining, 1);
  assert.equal(result.resetAt, 2_500);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'https://kv.example.com');
  assert.equal(requests[0]?.authorization, 'Bearer kv-token');
});

test('falls back to memory when Upstash is unavailable', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
  }) as typeof fetch;

  const first = await checkFixedWindowRateLimit({
    key: 'abuse-report:ip:127.0.0.1',
    windowMs: 60_000,
    limit: 1,
    now: 1_000,
  });
  const second = await checkFixedWindowRateLimit({
    key: 'abuse-report:ip:127.0.0.1',
    windowMs: 60_000,
    limit: 1,
    now: 2_000,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.backend, 'memory');
  assert.equal(second.allowed, false);
});
