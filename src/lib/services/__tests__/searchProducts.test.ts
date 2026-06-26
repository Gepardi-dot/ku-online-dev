import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { searchProducts as SearchProductsFn } from '../products';

type SearchProducts = typeof SearchProductsFn;

type SupabaseMock = {
  functions: { invoke: ReturnType<typeof mock.fn> };
  from: ReturnType<typeof mock.fn>;
};

const defaultCookies = {
  getAll: () => [],
  set: () => {},
};

declare global {
  var __supabaseClientMock: SupabaseMock | undefined;
  var __cookiesMock: typeof defaultCookies | undefined;
  var __algoliaSearchSingleIndexMock: ((...args: unknown[]) => unknown) | undefined;
}

async function loadSearchProducts() {
  const moduleUrl = new URL(`../products.js?test=${Date.now()}-${Math.random()}`, import.meta.url);
  const mod = (await import(moduleUrl.href)) as { searchProducts: SearchProducts };
  return mod.searchProducts;
}

function clearAlgoliaEnv(t: import('node:test').TestContext) {
  const originalAlgoliaAppId = process.env.ALGOLIA_APP_ID;
  const originalAlgoliaSearchKey = process.env.ALGOLIA_SEARCH_API_KEY;
  const originalAlgoliaIndexName = process.env.ALGOLIA_INDEX_NAME;

  delete process.env.ALGOLIA_APP_ID;
  delete process.env.ALGOLIA_SEARCH_API_KEY;
  delete process.env.ALGOLIA_INDEX_NAME;

  t.after(() => {
    if (originalAlgoliaAppId === undefined) {
      delete process.env.ALGOLIA_APP_ID;
    } else {
      process.env.ALGOLIA_APP_ID = originalAlgoliaAppId;
    }
    if (originalAlgoliaSearchKey === undefined) {
      delete process.env.ALGOLIA_SEARCH_API_KEY;
    } else {
      process.env.ALGOLIA_SEARCH_API_KEY = originalAlgoliaSearchKey;
    }
    if (originalAlgoliaIndexName === undefined) {
      delete process.env.ALGOLIA_INDEX_NAME;
    } else {
      process.env.ALGOLIA_INDEX_NAME = originalAlgoliaIndexName;
    }
  });
}

function createProductsQueryMock(response: { data: unknown[] | null; error: unknown; count?: number | null }) {
  const query: any = {};
  query.not = mock.fn(() => query);
  query.eq = mock.fn(() => query);
  query.gt = mock.fn(() => query);
  query.ilike = mock.fn(() => query);
  query.gte = mock.fn(() => query);
  query.lte = mock.fn(() => query);
  query.order = mock.fn(() => query);
  query.range = mock.fn(async () => response);

  const selectMock = mock.fn(() => query);
  const fromMock = mock.fn(() => ({ select: selectMock }));

  return { fromMock, selectMock, query };
}

test('searchProducts uses direct product query fallback when Algolia is unavailable', async (t) => {
  clearAlgoliaEnv(t);

  const invokeMock = mock.fn();
  const queryResponse = {
    data: [
      {
        id: 'product-1',
        title: 'Smartphone',
        description: 'Latest model',
        price: '450000',
        currency: 'IQD',
        condition: 'new',
        listing_type: 'sale',
        rental_term: null,
        category_id: 'category-1',
        seller_id: 'seller-1',
        location: 'Erbil',
        images: ['https://example.com/1.jpg'],
        is_active: true,
        is_sold: false,
        is_promoted: false,
        views: 120,
        created_at: '2024-05-01T00:00:00.000Z',
        updated_at: null,
        seller: {
          id: 'seller-1',
          email: 'seller@example.com',
          phone: null,
          full_name: 'Alice Seller',
          avatar_url: null,
          location: 'Erbil',
          bio: null,
          is_verified: true,
          rating: 4.8,
          total_ratings: 17,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
        category: {
          id: 'category-1',
          name: 'Phones',
          name_ar: null,
          name_ku: null,
          description: null,
          icon: '📱',
          is_active: true,
          sort_order: 1,
          created_at: '2024-01-10T00:00:00.000Z',
        },
      },
    ],
    error: null,
    count: 12,
  };

  const { fromMock, selectMock, query } = createProductsQueryMock(queryResponse);

  const supabaseClient: SupabaseMock = {
    functions: { invoke: invokeMock },
    from: fromMock,
  };

  globalThis.__supabaseClientMock = supabaseClient;
  globalThis.__cookiesMock = defaultCookies;

  t.after(() => {
    delete globalThis.__supabaseClientMock;
    delete globalThis.__cookiesMock;
  });

  const searchProducts = await loadSearchProducts();

  const result = await searchProducts({ search: 'phone' }, 24, 0, 'newest');

  assert.equal(result.count, 12);
  assert.equal(result.items.length, 1);
  const product = result.items[0];
  assert.equal(product.id, 'product-1');
  assert.equal(product.title, 'Smartphone');
  assert.equal(product.price, 450000);
  assert(product.seller);
  assert.equal(product.seller?.fullName, 'Alice Seller');
  assert.equal(product.category?.name, 'Phones');

  assert.equal(invokeMock.mock.calls.length, 0);
  assert.equal(fromMock.mock.calls.length, 1);
  assert.equal(selectMock.mock.calls.length, 1);
  assert.equal(query.ilike.mock.calls.length, 1);
  assert.deepEqual(query.ilike.mock.calls[0]?.arguments, ['title', '%phone%']);
  assert.equal(query.range.mock.calls.length, 1);
});

test('searchProducts returns an empty direct fallback result when product query fails', async (t) => {
  clearAlgoliaEnv(t);

  const invokeMock = mock.fn();
  const { fromMock } = createProductsQueryMock({ data: null, error: new Error('boom'), count: null });

  const supabaseClient: SupabaseMock = {
    functions: { invoke: invokeMock },
    from: fromMock,
  };

  globalThis.__supabaseClientMock = supabaseClient;
  globalThis.__cookiesMock = defaultCookies;

  const consoleErrorMock = mock.method(console, 'error');

  t.after(() => {
    delete globalThis.__supabaseClientMock;
    delete globalThis.__cookiesMock;
    consoleErrorMock.mock.restore();
  });

  const searchProducts = await loadSearchProducts();

  const result = await searchProducts({ search: 'audio' }, 24, 0, 'newest');

  assert.deepEqual(result, { items: [], count: 0 });
  assert.equal(invokeMock.mock.calls.length, 0);
  assert.equal(fromMock.mock.calls.length, 1);
  assert.equal(consoleErrorMock.mock.calls.length, 1);
});

test('searchProducts returns successful empty Algolia results without invoking edge fallback', async (t) => {
  const originalAlgoliaAppId = process.env.ALGOLIA_APP_ID;
  const originalAlgoliaSearchKey = process.env.ALGOLIA_SEARCH_API_KEY;
  const originalAlgoliaIndexName = process.env.ALGOLIA_INDEX_NAME;

  process.env.ALGOLIA_APP_ID = 'test-app';
  process.env.ALGOLIA_SEARCH_API_KEY = 'test-search-key';
  process.env.ALGOLIA_INDEX_NAME = 'products';

  const invokeMock = mock.fn(async () => ({
    data: null,
    error: new Error('edge fallback should not be invoked'),
  }));
  const fromMock = mock.fn();
  const algoliaSearchMock = mock.fn(async () => ({ hits: [], nbHits: 0 }));

  const supabaseClient: SupabaseMock = {
    functions: { invoke: invokeMock },
    from: fromMock,
  };

  globalThis.__supabaseClientMock = supabaseClient;
  globalThis.__cookiesMock = defaultCookies;
  globalThis.__algoliaSearchSingleIndexMock = algoliaSearchMock;

  t.after(() => {
    if (originalAlgoliaAppId === undefined) {
      delete process.env.ALGOLIA_APP_ID;
    } else {
      process.env.ALGOLIA_APP_ID = originalAlgoliaAppId;
    }
    if (originalAlgoliaSearchKey === undefined) {
      delete process.env.ALGOLIA_SEARCH_API_KEY;
    } else {
      process.env.ALGOLIA_SEARCH_API_KEY = originalAlgoliaSearchKey;
    }
    if (originalAlgoliaIndexName === undefined) {
      delete process.env.ALGOLIA_INDEX_NAME;
    } else {
      process.env.ALGOLIA_INDEX_NAME = originalAlgoliaIndexName;
    }

    delete globalThis.__supabaseClientMock;
    delete globalThis.__cookiesMock;
    delete globalThis.__algoliaSearchSingleIndexMock;
  });

  const searchProducts = await loadSearchProducts();

  const result = await searchProducts({ search: 'definitely absent' }, 24, 0, 'newest');

  assert.deepEqual(result, { items: [], count: 0 });
  assert.equal(algoliaSearchMock.mock.calls.length, 1);
  assert.equal(invokeMock.mock.calls.length, 0);
  assert.equal(fromMock.mock.calls.length, 0);
});
