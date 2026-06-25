import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DESCRIPTION,
  buildIndexScope,
  getOrCreateSearchApiKey,
  isReusableSearchKey,
} from '../algolia-search-key.mjs';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('buildIndexScope includes base index and current sort replicas', () => {
  assert.deepEqual(buildIndexScope('products'), [
    'products',
    'products_newest',
    'products_price_asc',
    'products_price_desc',
    'products_views_desc',
  ]);
});

test('isReusableSearchKey requires exact search-only ACL and index scope', () => {
  const indexes = buildIndexScope('products');
  assert.equal(
    isReusableSearchKey(
      {
        value: 'search-key',
        description: DEFAULT_DESCRIPTION,
        acl: ['search'],
        indexes: [...indexes].reverse(),
      },
      { description: DEFAULT_DESCRIPTION, indexes },
    ),
    true,
  );

  assert.equal(
    isReusableSearchKey(
      {
        value: 'too-broad',
        description: DEFAULT_DESCRIPTION,
        acl: ['addObject', 'search'],
        indexes,
      },
      { description: DEFAULT_DESCRIPTION, indexes },
    ),
    false,
  );
});

test('getOrCreateSearchApiKey reuses an existing restricted key', async () => {
  const calls = [];
  const result = await getOrCreateSearchApiKey({
    appId: 'app123',
    adminApiKey: 'admin123',
    indexName: 'products',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {
        keys: [
          {
            value: 'existing-search-key',
            description: DEFAULT_DESCRIPTION,
            acl: ['search'],
            indexes: buildIndexScope('products'),
          },
        ],
      });
    },
  });

  assert.equal(result.status, 'reused');
  assert.equal(result.key, 'existing-search-key');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
});

test('getOrCreateSearchApiKey creates a restricted key when no reusable key exists', async () => {
  const calls = [];
  const result = await getOrCreateSearchApiKey({
    appId: 'app123',
    adminApiKey: 'admin123',
    indexName: 'products',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'POST') {
        return jsonResponse(200, { key: 'created-search-key' });
      }
      return jsonResponse(200, {
        keys: [
          {
            value: 'too-broad',
            description: DEFAULT_DESCRIPTION,
            acl: ['search', 'addObject'],
            indexes: buildIndexScope('products'),
          },
        ],
      });
    },
  });

  assert.equal(result.status, 'created');
  assert.equal(result.key, 'created-search-key');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    acl: ['search'],
    description: DEFAULT_DESCRIPTION,
    indexes: buildIndexScope('products'),
  });
});
