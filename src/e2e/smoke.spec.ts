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
