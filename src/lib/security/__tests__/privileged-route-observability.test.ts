import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPrivilegedRouteEventPayload } from '../privileged-route-observability.js';

function requestWithHeaders(headers: HeadersInit): Request {
  return new Request('https://example.test/api/admin/revalidate', { headers, method: 'POST' });
}

test('buildPrivilegedRouteEventPayload redacts sensitive subject keys and hashes client identifiers', () => {
  const payload = buildPrivilegedRouteEventPayload(
    {
      route: 'admin/revalidate',
      method: 'post',
      event: 'unauthorized',
      outcome: 'denied',
      status: 401,
      reason: 'admin_token_invalid',
      request: requestWithHeaders({
        authorization: 'Bearer should-never-log',
        cookie: 'session=should-never-log',
        'x-forwarded-for': '203.0.113.10',
        'x-forwarded-host': 'www.kubazar.net',
        origin: 'https://www.kubazar.net/some/path?with=query',
        'user-agent': 'curl/8.0',
      }),
      subject: {
        productId: '123',
        token: 'should-never-log',
        secretValue: 'should-never-log',
      },
    },
    new Date('2026-06-22T12:00:00.000Z'),
  );

  const serialized = JSON.stringify(payload);

  assert.equal(payload.component, 'privileged-route');
  assert.equal(payload.method, 'POST');
  assert.equal(payload.timestamp, '2026-06-22T12:00:00.000Z');
  assert.equal(payload.request.clientHash?.length, 16);
  assert.equal(payload.request.host, 'www.kubazar.net');
  assert.equal(payload.request.origin, 'https://www.kubazar.net');
  assert.equal(payload.request.userAgentFamily, 'curl');
  assert.deepEqual(payload.subject, { productId: '123' });
  assert.equal(serialized.includes('should-never-log'), false);
  assert.equal(serialized.includes('203.0.113.10'), false);
});

test('buildPrivilegedRouteEventPayload keeps only safe scalar subject values', () => {
  const payload = buildPrivilegedRouteEventPayload({
    route: 'admin/moderate',
    method: 'POST',
    event: 'mutation_succeeded',
    outcome: 'succeeded',
    status: 200,
    request: requestWithHeaders({
      'x-real-ip': '198.51.100.4',
      'user-agent': 'Mozilla/5.0 Chrome/125.0',
    }),
    subject: {
      active: true,
      count: 2,
      labels: ['database', 'storage'],
      apiKey: 'should-never-log',
    },
  });

  assert.deepEqual(payload.subject, {
    active: true,
    count: 2,
    labels: ['database', 'storage'],
  });
  assert.equal(payload.request.userAgentFamily, 'chrome');
  assert.equal(JSON.stringify(payload).includes('should-never-log'), false);
});
