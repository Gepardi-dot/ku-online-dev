import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_ENV_KEYS,
  buildAlgoliaRecord,
  buildSmokeProductPayload,
  buildSmokeTitle,
  collectMissingEnv,
} from '../algolia-production-smoke.mjs';

test('collectMissingEnv reports only blank required env vars', () => {
  const env = Object.fromEntries(REQUIRED_ENV_KEYS.map((key) => [key, `${key}_value`]));
  env.ALGOLIA_SEARCH_API_KEY = '   ';

  assert.deepEqual(collectMissingEnv(env), ['ALGOLIA_SEARCH_API_KEY']);
});

test('buildSmokeProductPayload creates a temporary sellerless active sale listing', () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const title = buildSmokeTitle(productId);
  const expiresAt = new Date('2026-09-25T12:00:00.000Z');

  const payload = buildSmokeProductPayload({ productId, title, expiresAt });

  assert.equal(payload.id, productId);
  assert.equal(payload.title, 'KU BAZAR ALGOLIA SMOKE DELETE 11111111');
  assert.equal(payload.seller_id, null);
  assert.equal(payload.is_active, true);
  assert.equal(payload.is_sold, false);
  assert.equal(payload.listing_type, 'sale');
  assert.equal(payload.rental_term, null);
  assert.deepEqual(payload.images, []);
  assert.equal(payload.expires_at, expiresAt.toISOString());
});

test('buildAlgoliaRecord includes the app search filter fields', () => {
  const row = {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Smoke title',
    description: 'Smoke description',
    price: '12345',
    currency: 'IQD',
    condition: 'New',
    category_id: null,
    seller_id: null,
    location: 'Duhok',
    images: [],
    is_active: true,
    is_sold: false,
    is_promoted: false,
    views: 0,
    created_at: '2026-06-25T12:00:00.000Z',
    updated_at: '2026-06-25T12:00:00.000Z',
    expires_at: '2026-09-25T12:00:00.000Z',
    listing_type: 'sale',
    rental_term: null,
  };

  const record = buildAlgoliaRecord(row);

  assert.equal(record.objectID, row.id);
  assert.equal(record.seller_id, null);
  assert.equal(record.is_active, true);
  assert.equal(record.is_sold, false);
  assert.equal(record.listing_type, 'sale');
  assert.equal(record.location_normalized, 'duhok');
  assert.equal(record.created_at_ts, Date.parse(row.created_at));
  assert.equal(record.expires_at_ts, Date.parse(row.expires_at));
  assert.match(record.search_text, /Smoke title/);
});
