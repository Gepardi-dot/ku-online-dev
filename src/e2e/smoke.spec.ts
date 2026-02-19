import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test('health endpoint responds OK', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/health`);
  expect(res.ok()).toBeTruthy();
});

test('homepage has no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(BASE_URL + '/');
  await page.waitForLoadState('networkidle');
  expect(errors.join('\n')).toBe('');
});

test('messages endpoints require auth', async ({ request }) => {
  const conversations = await request.get(`${BASE_URL}/api/messages/conversations`);
  expect([401, 403]).toContain(conversations.status());

  const unread = await request.get(`${BASE_URL}/api/messages/unread-count`);
  expect([401, 403]).toContain(unread.status());
});

test('push subscription endpoint is reachable', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/pwa/push/subscriptions`);
  expect([401, 503]).toContain(res.status());
});

test('telemetry endpoint accepts pwa lifecycle events', async ({ request }) => {
  const res = await request.post(`${BASE_URL}/api/pwa/telemetry`, {
    data: {
      events: [{ type: 'pwa_lifecycle', name: 'smoke_signal', ts: Date.now(), path: '/' }],
      context: { displayMode: 'browser' },
    },
  });

  expect([200, 503]).toContain(res.status());
});

test('admin telemetry summary endpoint requires auth', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/admin/pwa/telemetry/summary`);
  expect([401, 403]).toContain(res.status());
});

test('admin pwa slo alert trigger endpoint requires auth', async ({ request }) => {
  const res = await request.post(`${BASE_URL}/api/admin/pwa/slo-alerts/trigger`, {
    data: {},
  });
  expect([401, 403]).toContain(res.status());
});

test('internal pwa slo alerts endpoint requires secret', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/internal/pwa/slo-alerts`);
  expect([401, 503]).toContain(res.status());
});

test('internal pwa rollout status endpoint requires secret', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/internal/pwa/rollout-status`);
  expect([401, 503]).toContain(res.status());
});

test('manifest is available for installability', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/manifest.webmanifest`);
  expect(res.ok()).toBeTruthy();

  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(Array.isArray(manifest.icons)).toBeTruthy();
  expect(manifest.icons.some((icon: { sizes?: string }) => icon.sizes === '192x192')).toBeTruthy();
  expect(manifest.icons.some((icon: { sizes?: string }) => icon.sizes === '512x512')).toBeTruthy();
});

test('service worker endpoint is served with strict cache headers', async ({ request }) => {
  const res = await request.fetch(`${BASE_URL}/sw.js`, { method: 'HEAD' });
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['cache-control']).toContain('no-cache');
  expect(res.headers()['service-worker-allowed']).toBe('/');
});

test('offline fallback page is accessible', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/offline.html`);
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain('You are offline');
});
