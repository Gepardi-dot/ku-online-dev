import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rankSponsoredFeed, type SponsoredFeedItem } from '../sponsored-feed';

function item(partial: Partial<SponsoredFeedItem> & Pick<SponsoredFeedItem, 'price'>): SponsoredFeedItem {
  return {
    sponsorStoreId: null,
    isPromoted: false,
    views: 0,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...partial,
  };
}

test('sponsored listings lead the feed ahead of newer regular listings', () => {
  const regular = item({
    price: 10,
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
  });
  const featured = item({
    price: 20,
    isPromoted: true,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
  });
  const olderSponsored = item({
    price: 5,
    sponsorStoreId: 'store-old',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  });
  const newerSponsored = item({
    price: 8,
    sponsorStoreId: 'store-new',
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
  });

  const ranked = rankSponsoredFeed([regular, olderSponsored, featured, newerSponsored], 'newest');

  assert.deepEqual(
    ranked.map((entry) => entry.sponsorStoreId),
    ['store-new', 'store-old', null, null],
  );
  assert.equal(ranked[2]?.isPromoted, true);
  assert.equal(ranked[3]?.price, 10);
});

test('price sort still keeps sponsored listings first', () => {
  const cheapRegular = item({ price: 1 });
  const expensiveSponsored = item({ price: 99, sponsorStoreId: 'store' });

  const ranked = rankSponsoredFeed([cheapRegular, expensiveSponsored], 'price_asc');

  assert.equal(ranked[0]?.sponsorStoreId, 'store');
  assert.equal(ranked[1]?.price, 1);
});
