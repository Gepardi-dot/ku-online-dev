import type { SponsorOffer, SponsorOfferDetails, SponsorOfferPreview, SponsorStore, SponsorStoreDetails } from '@/lib/services/sponsors';

export type MockSponsorProductCard = {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  currency: string | null;
  imageUrl: string | null;
  description?: string | null;
};

export type MockSponsorProductDetails = MockSponsorProductCard & {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogoUrl: string | null;
};

const STORE_DETAILS: SponsorStoreDetails[] = [
  {
    id: 'mock-store-zain-phones',
    name: 'Zain Phones',
    slug: 'zain-phones',
    description: 'Fast phone repairs, accessories, and same-day service.',
    logoUrl: '/KU-LOGO.png',
    coverUrl: '/prototype-store-card-1.png',
    primaryCity: 'erbil',
    phone: '+9647501112233',
    whatsapp: '+9647501112233',
    website: 'https://kubazar.example/zain-phones',
    ownerUserId: null,
    sponsorTier: 'featured',
    isFeatured: true,
    updatedAt: new Date('2026-02-01T10:30:00.000Z'),
    locations: [
      {
        id: 'mock-zain-main',
        city: 'erbil',
        address: '100m St, near Family Mall',
        lat: 36.1911,
        lng: 44.0092,
        phone: '+9647501112233',
        isPrimary: true,
      },
    ],
    categories: [
      { id: 'mock-cat-phones', name: 'Phones & Accessories', nameAr: null, nameKu: null, icon: null },
      { id: 'mock-cat-home', name: 'Home & Furniture', nameAr: null, nameKu: null, icon: null },
    ],
  },
  {
    id: 'mock-store-nova-home',
    name: 'Nova Home',
    slug: 'nova-home',
    description: 'Furniture, decor, and appliance bundles for modern homes.',
    logoUrl: '/icon-128.png',
    coverUrl: '/prototype-store-card-2.png',
    primaryCity: 'erbil',
    phone: '+9647504448899',
    whatsapp: '+9647504448899',
    website: 'https://kubazar.example/nova-home',
    ownerUserId: null,
    sponsorTier: 'featured',
    isFeatured: true,
    updatedAt: new Date('2026-02-03T12:00:00.000Z'),
    locations: [
      {
        id: 'mock-nova-main',
        city: 'erbil',
        address: 'Mall Road, Showroom #12',
        lat: 36.865,
        lng: 42.9885,
        phone: '+9647504448899',
        isPrimary: true,
      },
    ],
    categories: [{ id: 'mock-cat-furniture', name: 'Furniture', nameAr: null, nameKu: null, icon: null }],
  },
  {
    id: 'mock-store-shahr-car',
    name: 'Shahr Car Service',
    slug: 'shahr-car-service',
    description: 'Oil change, diagnostics, and car detailing offers every week.',
    logoUrl: '/icon-192.png',
    coverUrl: '/prototype-store-card-3.png',
    primaryCity: 'erbil',
    phone: '+9647709011188',
    whatsapp: '+9647709011188',
    website: 'https://kubazar.example/shahr-car',
    ownerUserId: null,
    sponsorTier: 'basic',
    isFeatured: true,
    updatedAt: new Date('2026-02-02T09:15:00.000Z'),
    locations: [
      {
        id: 'mock-shahr-main',
        city: 'erbil',
        address: 'Salim Street, opposite City Star',
        lat: 35.565,
        lng: 45.435,
        phone: '+9647709011188',
        isPrimary: true,
      },
    ],
    categories: [{ id: 'mock-cat-cars', name: 'Cars', nameAr: null, nameKu: null, icon: null }],
  },
];

const BASE_OFFERS: SponsorOffer[] = [
  {
    id: 'mock-offer-zain-1',
    storeId: 'mock-store-zain-phones',
    title: '20% off accessories (cases, chargers, power banks)',
    description: 'Applies to in-store accessories only. Limited time.',
    discountType: 'percent',
    discountValue: 20,
    currency: 'IQD',
    endAt: new Date('2026-03-10T21:00:00.000Z'),
    store: {
      id: 'mock-store-zain-phones',
      name: 'Zain Phones',
      slug: 'zain-phones',
      logoUrl: '/KU-LOGO.png',
      primaryCity: 'erbil',
    },
  },
  {
    id: 'mock-offer-zain-2',
    storeId: 'mock-store-zain-phones',
    title: 'Free screen protector with any repair',
    description: 'Get a protector applied on the spot.',
    discountType: 'freebie',
    discountValue: null,
    currency: null,
    endAt: new Date('2026-03-22T21:00:00.000Z'),
    store: {
      id: 'mock-store-zain-phones',
      name: 'Zain Phones',
      slug: 'zain-phones',
      logoUrl: '/KU-LOGO.png',
      primaryCity: 'erbil',
    },
  },
  {
    id: 'mock-offer-nova-1',
    storeId: 'mock-store-nova-home',
    title: 'Up to 14% off selected living room sets',
    description: 'Bundle discount for sofa + table purchases.',
    discountType: 'percent',
    discountValue: 14,
    currency: 'IQD',
    endAt: new Date('2026-03-18T21:00:00.000Z'),
    store: {
      id: 'mock-store-nova-home',
      name: 'Nova Home',
      slug: 'nova-home',
      logoUrl: '/icon-128.png',
      primaryCity: 'duhok',
    },
  },
  {
    id: 'mock-offer-shahr-1',
    storeId: 'mock-store-shahr-car',
    title: 'Oil change + quick diagnostics',
    description: 'Fast check and fluid top-up included.',
    discountType: 'amount',
    discountValue: 10000,
    currency: 'IQD',
    endAt: new Date('2026-03-12T21:00:00.000Z'),
    store: {
      id: 'mock-store-shahr-car',
      name: 'Shahr Car Service',
      slug: 'shahr-car-service',
      logoUrl: '/icon-192.png',
      primaryCity: 'slemani',
    },
  },
];

const OFFER_DETAILS: SponsorOfferDetails[] = [
  {
    ...BASE_OFFERS[0],
    terms: 'Valid for accessories above 10,000 IQD. Cannot be combined.',
    startAt: new Date('2026-02-01T00:00:00.000Z'),
    store: {
      id: 'mock-store-zain-phones',
      name: 'Zain Phones',
      slug: 'zain-phones',
      logoUrl: '/KU-LOGO.png',
      primaryCity: 'erbil',
      phone: '+9647501112233',
      whatsapp: '+9647501112233',
      website: 'https://kubazar.example/zain-phones',
    },
  },
  {
    ...BASE_OFFERS[1],
    terms: 'One protector per repair invoice.',
    startAt: new Date('2026-02-04T00:00:00.000Z'),
    store: {
      id: 'mock-store-zain-phones',
      name: 'Zain Phones',
      slug: 'zain-phones',
      logoUrl: '/KU-LOGO.png',
      primaryCity: 'erbil',
      phone: '+9647501112233',
      whatsapp: '+9647501112233',
      website: 'https://kubazar.example/zain-phones',
    },
  },
  {
    ...BASE_OFFERS[2],
    terms: 'Applies to tagged products only.',
    startAt: new Date('2026-02-03T00:00:00.000Z'),
    store: {
      id: 'mock-store-nova-home',
      name: 'Nova Home',
      slug: 'nova-home',
      logoUrl: '/icon-128.png',
      primaryCity: 'duhok',
      phone: '+9647504448899',
      whatsapp: '+9647504448899',
      website: 'https://kubazar.example/nova-home',
    },
  },
  {
    ...BASE_OFFERS[3],
    terms: 'Includes standard diagnostics only.',
    startAt: new Date('2026-02-05T00:00:00.000Z'),
    store: {
      id: 'mock-store-shahr-car',
      name: 'Shahr Car Service',
      slug: 'shahr-car-service',
      logoUrl: '/icon-192.png',
      primaryCity: 'slemani',
      phone: '+9647709011188',
      whatsapp: '+9647709011188',
      website: 'https://kubazar.example/shahr-car',
    },
  },
];

const OFFER_PREVIEWS: SponsorOfferPreview[] = [
  {
    id: 'mock-offer-zain-1',
    storeId: 'mock-store-zain-phones',
    title: '20% off accessories',
    discountType: 'percent',
    discountValue: 20,
    currency: 'IQD',
    endAt: new Date('2026-03-10T21:00:00.000Z'),
    originalPrice: 50000,
    dealPrice: 40000,
  },
  {
    id: 'mock-offer-nova-1',
    storeId: 'mock-store-nova-home',
    title: 'Living room deals',
    discountType: 'percent',
    discountValue: 14,
    currency: 'IQD',
    endAt: new Date('2026-03-18T21:00:00.000Z'),
    originalPrice: 350000,
    dealPrice: 301000,
  },
  {
    id: 'mock-offer-shahr-1',
    storeId: 'mock-store-shahr-car',
    title: 'Oil change + diagnostics',
    discountType: 'amount',
    discountValue: 10000,
    currency: 'IQD',
    endAt: new Date('2026-03-12T21:00:00.000Z'),
    originalPrice: 45000,
    dealPrice: 35000,
  },
];

const PRODUCTS_BY_STORE_SLUG: Record<string, MockSponsorProductCard[]> = {
  'zain-phones': [
    {
      id: 'mock-prod-zain-1',
      title: 'iPhone 14 Pro 256GB',
      price: 980000,
      originalPrice: 1100000,
      currency: 'IQD',
      imageUrl: '/icon-512.png',
      description: 'Factory unlocked, battery health 90%+, with box and cable.',
    },
    {
      id: 'mock-prod-zain-2',
      title: 'AirPods Pro (2nd Gen)',
      price: 245000,
      originalPrice: 280000,
      currency: 'IQD',
      imageUrl: '/icon-256.png',
      description: 'Active noise cancellation and spatial audio support.',
    },
    {
      id: 'mock-prod-zain-3',
      title: '65W Fast Charger',
      price: 22000,
      originalPrice: 30000,
      currency: 'IQD',
      imageUrl: '/icon-128.png',
      description: 'USB-C PD charger compatible with phones, tablets, and laptops.',
    },
  ],
  'nova-home': [
    {
      id: 'mock-prod-nova-1',
      title: '3-Seater Fabric Sofa',
      price: 420000,
      originalPrice: 510000,
      currency: 'IQD',
      imageUrl: '/icon-512.png',
      description: 'Soft-touch fabric with solid wood frame and washable covers.',
    },
    {
      id: 'mock-prod-nova-2',
      title: 'Coffee Table Set',
      price: 110000,
      originalPrice: 145000,
      currency: 'IQD',
      imageUrl: '/icon-256.png',
      description: 'Two-piece nested table set with scratch-resistant finish.',
    },
    {
      id: 'mock-prod-nova-3',
      title: 'Accent Floor Lamp',
      price: 55000,
      originalPrice: 70000,
      currency: 'IQD',
      imageUrl: '/icon-128.png',
      description: 'Warm ambient light ideal for living rooms and bedrooms.',
    },
  ],
  'shahr-car-service': [
    {
      id: 'mock-prod-shahr-1',
      title: 'Full Car Detail Package',
      price: 65000,
      originalPrice: 90000,
      currency: 'IQD',
      imageUrl: '/icon-512.png',
      description: 'Interior and exterior detail with wax and tire dressing.',
    },
    {
      id: 'mock-prod-shahr-2',
      title: 'Engine Oil 5L',
      price: 32000,
      originalPrice: 39000,
      currency: 'IQD',
      imageUrl: '/icon-256.png',
      description: 'Synthetic blend suitable for most modern sedan engines.',
    },
    {
      id: 'mock-prod-shahr-3',
      title: 'Premium Wiper Set',
      price: 18000,
      originalPrice: 24000,
      currency: 'IQD',
      imageUrl: '/icon-128.png',
      description: 'All-weather blades with silent operation and clean wipe.',
    },
  ],
};

function cityMatch(cityFilter: string | null | undefined, cityValue: string | null): boolean {
  const filter = typeof cityFilter === 'string' ? cityFilter.trim().toLowerCase() : '';
  if (!filter || filter === 'all') return true;
  return (cityValue ?? '').trim().toLowerCase() === filter;
}

function toStoreSummary(store: SponsorStoreDetails): SponsorStore {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description,
    logoUrl: store.logoUrl,
    coverUrl: store.coverUrl,
    primaryCity: store.primaryCity,
    phone: store.phone,
    whatsapp: store.whatsapp,
    website: store.website,
    ownerUserId: store.ownerUserId,
    sponsorTier: store.sponsorTier,
    isFeatured: store.isFeatured,
    updatedAt: store.updatedAt,
  };
}

export function getMockSpotlightSponsorStores(options: { city?: string | null; limit?: number } = {}): SponsorStore[] {
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 8;
  return STORE_DETAILS.filter((store) => cityMatch(options.city, store.primaryCity))
    .slice(0, limit)
    .map((store) => toStoreSummary(store));
}

export function getMockSponsorOfferPreviewsByStoreIds(storeIds: string[]): Record<string, SponsorOfferPreview> {
  const unique = new Set(storeIds.filter(Boolean));
  const out: Record<string, SponsorOfferPreview> = {};
  for (const preview of OFFER_PREVIEWS) {
    if (!unique.has(preview.storeId)) continue;
    out[preview.storeId] = preview;
  }
  return out;
}

export function getMockSponsorStoreBySlug(slug: string): SponsorStoreDetails | null {
  const normalized = (slug ?? '').trim().toLowerCase();
  if (!normalized) return null;
  return STORE_DETAILS.find((store) => store.slug === normalized) ?? null;
}

export function getMockSponsorOffersByStoreId(storeId: string, limit = 20): SponsorOffer[] {
  return BASE_OFFERS.filter((offer) => offer.storeId === storeId).slice(0, limit);
}

export function getMockSponsorOfferById(offerId: string): SponsorOfferDetails | null {
  return OFFER_DETAILS.find((offer) => offer.id === offerId) ?? null;
}

export function getMockProductsByStoreSlug(slug: string): MockSponsorProductCard[] {
  const normalized = (slug ?? '').trim().toLowerCase();
  return PRODUCTS_BY_STORE_SLUG[normalized] ?? [];
}

export function getMockProductById(productId: string): MockSponsorProductDetails | null {
  const normalized = (productId ?? '').trim().toLowerCase();
  if (!normalized) return null;

  for (const store of STORE_DETAILS) {
    const products = PRODUCTS_BY_STORE_SLUG[store.slug] ?? [];
    for (const product of products) {
      if (product.id !== normalized) continue;
      return {
        ...product,
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        storeLogoUrl: store.logoUrl,
      };
    }
  }

  return null;
}
