import assert from 'node:assert/strict';
import test from 'node:test';

import { isAdminTokenAuthorized, readAdminToken, timingSafeTokenEqual } from '../admin-token.js';

function requestWithHeaders(headers: HeadersInit): Request {
  return new Request('https://example.test/internal', { headers });
}

test('readAdminToken prefers bearer authorization over x-admin-token', () => {
  const request = requestWithHeaders({
    authorization: 'Bearer bearer-secret',
    'x-admin-token': 'legacy-secret',
  });

  assert.equal(readAdminToken(request), 'bearer-secret');
});

test('readAdminToken falls back to x-admin-token for legacy callers', () => {
  const request = requestWithHeaders({
    'x-admin-token': ' legacy-secret ',
  });

  assert.equal(readAdminToken(request), 'legacy-secret');
});

test('timingSafeTokenEqual rejects empty and mismatched tokens', () => {
  assert.equal(timingSafeTokenEqual('', 'secret'), false);
  assert.equal(timingSafeTokenEqual('secret', ''), false);
  assert.equal(timingSafeTokenEqual('short', 'much-longer-secret'), false);
  assert.equal(timingSafeTokenEqual('wrong-secret', 'right-secret'), false);
});

test('timingSafeTokenEqual accepts matching tokens', () => {
  assert.equal(timingSafeTokenEqual('same-secret', 'same-secret'), true);
});

test('isAdminTokenAuthorized supports bearer and legacy header tokens', () => {
  assert.equal(isAdminTokenAuthorized(requestWithHeaders({ authorization: 'Bearer secret' }), 'secret'), true);
  assert.equal(isAdminTokenAuthorized(requestWithHeaders({ 'x-admin-token': 'secret' }), 'secret'), true);
});

test('isAdminTokenAuthorized rejects missing expected token', () => {
  assert.equal(isAdminTokenAuthorized(requestWithHeaders({ authorization: 'Bearer secret' }), undefined), false);
  assert.equal(isAdminTokenAuthorized(requestWithHeaders({ authorization: 'Bearer secret' }), ''), false);
});
