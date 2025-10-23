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
  // eslint-disable-next-line no-var
  var __supabaseClientMock: SupabaseMock | undefined;
  // eslint-disable-next-line no-var
  var __cookiesMock: typeof defaultCookies | undefined;
}

async function loadSearchProducts() {
  const module = (await import('../products.js')) as { searchProducts: SearchProducts };
  return module.searchProducts;
}

test('searchProducts normalizes edge results and fetches relations', async (t) => {
  const invokeMock = mock.fn(async () => ({
    data: {
      items: [
        {
          id: 'product-1',
          title: 'Smartphone',
          description: 'Latest model',
          price: '450000',
          currency: 'IQD',
          condition: 'new',
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
        },
      ],
      totalCount: 12,
      limit: 24,
      offset: 0,
    },
    error: null,
  }));

  const detailResponse = {
    data: [
      {
        id: 'product-1',
        title: 'Smartphone',
        description: 'Latest model',
        price: '450000',
        currency: 'IQD',
        condition: 'new',
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
  };

  const inMock = mock.fn(async () => detailResponse);
  const selectMock = mock.fn(() => ({ in: inMock }));
  const fromMock = mock.fn(() => ({ select: selectMock }));

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

  assert.equal(invokeMock.mock.calls.length, 1);
  const firstCall = invokeMock.mock.calls[0];
  assert.ok(firstCall);
  const callArgs = (firstCall as any).arguments;
  assert.equal(callArgs[0], 'product-search');
  assert.deepEqual(callArgs[1], {
    body: {
      query: 'phone',
      categoryId: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      city: undefined,
      limit: 24,
      offset: 0,
    },
  });

  assert.equal(fromMock.mock.calls.length, 1);
  assert.equal(selectMock.mock.calls.length, 1);
  assert.equal(inMock.mock.calls.length, 1);
});

test('searchProducts falls back to edge payload when relation query fails', async (t) => {
  const invokeMock = mock.fn(async () => ({
    data: {
      items: [
        {
          id: 'product-2',
          title: 'Headphones',
          description: null,
          price: 99000,
          currency: 'IQD',
          condition: 'used',
          category_id: null,
          seller_id: 'seller-2',
          location: 'Sulaymaniyah',
          images: [],
          is_active: true,
          is_sold: false,
          is_promoted: false,
          views: 12,
          created_at: '2024-02-01T00:00:00.000Z',
          updated_at: null,
        },
      ],
      totalCount: '5',
      limit: 24,
      offset: 0,
    },
    error: null,
  }));

  const failingInMock = mock.fn(async () => ({ data: null, error: new Error('boom') }));
  const selectMock = mock.fn(() => ({ in: failingInMock }));
  const fromMock = mock.fn(() => ({ select: selectMock }));

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

  assert.equal(result.count, 5);
  assert.equal(result.items.length, 1);
  const product = result.items[0];
  assert.equal(product.id, 'product-2');
  assert.equal(product.title, 'Headphones');
  assert.equal(product.seller, null);
  assert.equal(product.category, null);
  assert.equal(consoleErrorMock.mock.calls.length, 1);
});
