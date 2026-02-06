import type { SponsorOffer, SponsorOfferDiscountType, SponsorStore } from '@/lib/services/sponsors';

export type PreviewProduct = {
  id: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: string | null;
  imageUrl: string | null;
  href?: string | null;
};

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function createRng(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const idx = Math.floor(rng() * items.length);
  return items[Math.max(0, Math.min(items.length - 1, idx))]!;
}

function normalizeCity(value: string | null): string | null {
  const normalized = (value ?? '').trim();
  return normalized ? normalized : null;
}

export function buildPreviewProducts(input: {
  seed: string;
  storeName: string;
  coverUrl: string | null;
  primaryCity: string | null;
  count?: number;
}): PreviewProduct[] {
  const count = typeof input.count === 'number' && input.count > 0 ? Math.min(input.count, 12) : 6;
  const seed = stableHash(input.seed);
  const rng = createRng(seed);

  const imagePool = [
    input.coverUrl?.trim() || null,
    'https://picsum.photos/seed/ku-bazar-1/700/520',
    'https://picsum.photos/seed/ku-bazar-2/700/520',
    'https://picsum.photos/seed/ku-bazar-3/700/520',
    'https://picsum.photos/seed/ku-bazar-4/700/520',
    'https://picsum.photos/seed/ku-bazar-5/700/520',
  ].filter(Boolean) as string[];

  const city = normalizeCity(input.primaryCity);
  const currency = 'IQD';

  const productTemplates = [
    { title: 'iPhone 13 Pro (256GB) — Like New', base: 980_000 },
    { title: 'AirPods Pro (2nd Gen) — New', base: 210_000 },
    { title: 'Samsung S23 Ultra — 12/256', base: 1_050_000 },
    { title: 'Fast charger + cable bundle', base: 35_000 },
    { title: 'Screen protector + installation', base: 10_000 },
    { title: 'Laptop cleaning + thermal paste', base: 40_000 },
    { title: 'Car oil change (premium)', base: 60_000 },
    { title: 'Brake pads + installation', base: 120_000 },
    { title: 'Gym 1-month pass', base: 55_000 },
    { title: 'Haircut + beard trim', base: 15_000 },
    { title: 'Skin care package (1 session)', base: 30_000 },
    { title: 'Home appliance repair visit', base: 25_000 },
  ] as const;

  const storeHint = input.storeName.toLowerCase();
  const curated = productTemplates.filter((item) => {
    if (storeHint.includes('phone') || storeHint.includes('mobile') || storeHint.includes('zain')) {
      return item.title.toLowerCase().includes('iphone') || item.title.toLowerCase().includes('airpods') || item.title.toLowerCase().includes('samsung') || item.title.toLowerCase().includes('charger') || item.title.toLowerCase().includes('screen');
    }
    if (storeHint.includes('car') || storeHint.includes('service')) {
      return item.title.toLowerCase().includes('car') || item.title.toLowerCase().includes('oil') || item.title.toLowerCase().includes('brake');
    }
    if (storeHint.includes('gym')) {
      return item.title.toLowerCase().includes('gym');
    }
    if (storeHint.includes('beauty') || storeHint.includes('salon')) {
      return item.title.toLowerCase().includes('hair') || item.title.toLowerCase().includes('skin');
    }
    return true;
  });

  const pool = curated.length >= 6 ? curated : productTemplates;
  const used = new Set<number>();

  const items: PreviewProduct[] = [];
  while (items.length < count) {
    const next = Math.floor(rng() * pool.length);
    if (used.has(next)) continue;
    used.add(next);
    const template = pool[next]!;
    const noise = 0.9 + rng() * 0.25;
    const price = Math.max(5_000, Math.round(template.base * noise / 500) * 500);
    const hasDiscount = rng() > 0.35;
    const originalPrice = hasDiscount
      ? Math.round((price * (1.15 + rng() * 0.35)) / 500) * 500
      : null;
    items.push({
      id: `preview-${seed}-${items.length + 1}`,
      title: city ? `${template.title} · ${city}` : template.title,
      price,
      originalPrice,
      currency,
      imageUrl: pick(rng, imagePool),
      href: null,
    });
  }

  return items;
}

export function buildPreviewOffers(input: {
  seed: string;
  store: Pick<SponsorStore, 'id' | 'slug' | 'name' | 'logoUrl' | 'primaryCity'>;
  count?: number;
}): SponsorOffer[] {
  const count = typeof input.count === 'number' && input.count > 0 ? Math.min(input.count, 8) : 4;
  const seed = stableHash(input.seed);
  const rng = createRng(seed);

  const templates: Array<{
    title: string;
    description: string;
    discountType: SponsorOfferDiscountType;
    discountValue: number | null;
  }> = [
    {
      title: '20% off accessories (cases, chargers)',
      description: 'Cash-first deal for KU BAZAR users.',
      discountType: 'percent',
      discountValue: 20,
    },
    {
      title: 'FREE screen protector with any repair',
      description: 'Applied on the spot.',
      discountType: 'freebie',
      discountValue: null,
    },
    {
      title: '15,000 IQD off service fee',
      description: 'Show this offer in-store to get the discount.',
      discountType: 'amount',
      discountValue: 15_000,
    },
    {
      title: 'First visit discount',
      description: 'Perfect for new customers.',
      discountType: 'custom',
      discountValue: null,
    },
    {
      title: 'Buy 2 get 1 free (selected items)',
      description: 'Ask the cashier which items apply today.',
      discountType: 'custom',
      discountValue: null,
    },
  ];

  const items: SponsorOffer[] = [];
  const used = new Set<number>();
  while (items.length < count) {
    const idx = Math.floor(rng() * templates.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const template = templates[idx]!;
    const endAt = new Date(Date.now() + Math.floor((2 + rng() * 18) * 24 * 60 * 60 * 1000));
    items.push({
      id: `preview-offer-${seed}-${items.length + 1}`,
      storeId: input.store.id,
      title: template.title,
      description: template.description,
      discountType: template.discountType,
      discountValue: template.discountValue,
      currency: template.discountType === 'amount' ? 'IQD' : 'IQD',
      endAt,
      store: input.store,
    });
  }

  return items;
}
