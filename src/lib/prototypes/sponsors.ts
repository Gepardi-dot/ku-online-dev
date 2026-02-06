import type {
  SponsorOfferDetails,
  SponsorStoreCategory,
  SponsorStoreDetails,
  SponsorStoreLocation,
} from '@/lib/services/sponsors';

export type PrototypeKpis = {
  views30d: number;
  claims30d: number;
  redemptions30d: number;
  lastRedemptionAt: Date | null;
};

export type PrototypeSponsorStore = SponsorStoreDetails & {
  status: 'active' | 'pending' | 'disabled';
  sponsorTier: 'basic' | 'featured';
  isFeatured: boolean;
  updatedAt: Date | null;
  kpis: PrototypeKpis;
};

export type PrototypeSponsorOffer = SponsorOfferDetails & {
  status: 'active' | 'paused' | 'expired' | 'archived' | 'draft';
  isFeatured: boolean;
  maxTotalRedemptions: number | null;
  sampleVoucherCode: string;
  originalPrice: number | null;
  dealPrice: number | null;
  kpis: PrototypeKpis;
};

export type PrototypeVoucherStatus = 'active' | 'redeemed' | 'expired' | 'void';

export type PrototypeVoucher = {
  id: string;
  code: string;
  status: PrototypeVoucherStatus;
  claimedAt: Date;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  store: Pick<PrototypeSponsorStore, 'id' | 'name' | 'slug' | 'logoUrl' | 'primaryCity'>;
  offer: Pick<PrototypeSponsorOffer, 'id' | 'title' | 'discountType' | 'discountValue' | 'currency'>;
};

export type PrototypeStaffRole = 'manager' | 'cashier';
export type PrototypeStaffStatus = 'active' | 'disabled';

export type PrototypeStaffMember = {
  id: string;
  storeId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: PrototypeStaffRole;
  status: PrototypeStaffStatus;
  createdAt: Date;
};

function d(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
}

function location(input: Partial<SponsorStoreLocation> & { id: string }): SponsorStoreLocation {
  return {
    id: input.id,
    city: input.city ?? null,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    phone: input.phone ?? null,
    isPrimary: Boolean(input.isPrimary),
  };
}

function category(input: SponsorStoreCategory): SponsorStoreCategory {
  return input;
}

function kpis(seed: Partial<PrototypeKpis> = {}): PrototypeKpis {
  return {
    views30d: seed.views30d ?? 0,
    claims30d: seed.claims30d ?? 0,
    redemptions30d: seed.redemptions30d ?? 0,
    lastRedemptionAt: seed.lastRedemptionAt ?? null,
  };
}

export const PROTOTYPE_CATEGORIES: SponsorStoreCategory[] = [
  category({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Phones & Accessories',
    nameAr: 'هواتف وملحقات',
    nameKu: 'مۆبایل و پێکهاتەکان',
    icon: 'smartphone',
  }),
  category({
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Cars & Service',
    nameAr: 'سيارات وصيانة',
    nameKu: 'ئۆتۆمبیل و سێرڤیس',
    icon: 'car',
  }),
  category({
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Beauty & Wellness',
    nameAr: 'جمال وعناية',
    nameKu: 'جوانکاری و تەندروستی',
    icon: 'sparkles',
  }),
  category({
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Home & Furniture',
    nameAr: 'المنزل والأثاث',
    nameKu: 'ماڵ و کەلوپەل',
    icon: 'sofa',
  }),
  category({
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Food & Café',
    nameAr: 'طعام ومقاهي',
    nameKu: 'خواردن و کافێ',
    icon: 'coffee',
  }),
  category({
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Fitness',
    nameAr: 'لياقة بدنية',
    nameKu: 'وەرزش',
    icon: 'dumbbell',
  }),
];

const STORE_ZAIN: PrototypeSponsorStore = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Zain Phones',
  slug: 'zain-phones',
  description: 'هواتف وملحقات وصيانة سريعة — خصومات خاصة لمستخدمي KU BAZAR.',
  logoUrl: 'https://placehold.co/120x120/png?text=ZP',
  coverUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'erbil',
  phone: '+964 750 111 2222',
  whatsapp: '+964 750 111 2222',
  website: 'zainphones.example',
  ownerUserId: null,
  sponsorTier: 'featured',
  isFeatured: true,
  updatedAt: d(-1),
  status: 'active',
  locations: [
    location({
      id: 'aaaaaaaa-0000-0000-0000-aaaaaaaa0001',
      city: 'erbil',
      address: '100m St, near Family Mall',
      lat: 36.1911,
      lng: 44.0092,
      phone: '+964 750 111 2222',
      isPrimary: true,
    }),
    location({
      id: 'aaaaaaaa-0000-0000-0000-aaaaaaaa0002',
      city: 'erbil',
      address: 'Iskan St, opposite City Center',
      lat: 36.205,
      lng: 44.03,
      phone: '+964 750 111 2223',
      isPrimary: false,
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[0]!, PROTOTYPE_CATEGORIES[3]!],
  kpis: kpis({ views30d: 3240, claims30d: 410, redemptions30d: 168, lastRedemptionAt: d(-0.2) }),
};

const STORE_SHAHR: PrototypeSponsorStore = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Shahr Car Service',
  slug: 'shahr-car-service',
  description: 'چاودێری، ڕۆن، و بڕێکس — خزمەتگوزاری خێرا بە کۆدی KU BAZAR.',
  logoUrl: 'https://placehold.co/120x120/png?text=SCS',
  coverUrl: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'erbil',
  phone: '+964 770 333 4444',
  whatsapp: '+964 770 333 4444',
  website: 'shahrservice.example',
  ownerUserId: null,
  sponsorTier: 'basic',
  isFeatured: false,
  updatedAt: d(-3),
  status: 'active',
  locations: [
    location({
      id: 'bbbbbbbb-0000-0000-0000-bbbbbbbb0001',
      city: 'erbil',
      address: 'Kasnazan Rd, Garage zone',
      lat: 36.15,
      lng: 44.05,
      isPrimary: true,
      phone: '+964 770 333 4444',
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[1]!],
  kpis: kpis({ views30d: 980, claims30d: 120, redemptions30d: 44, lastRedemptionAt: d(-2) }),
};

const STORE_DARYA: PrototypeSponsorStore = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  name: 'Darya Beauty Studio',
  slug: 'darya-beauty',
  description: 'تصفيف وجمال بأجواء راقية — خصم لأول زيارة.',
  logoUrl: 'https://placehold.co/120x120/png?text=DB',
  coverUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'sulaymaniyah',
  phone: '+964 750 555 6666',
  whatsapp: '+964 750 555 6666',
  website: 'daryabeauty.example',
  ownerUserId: null,
  sponsorTier: 'featured',
  isFeatured: true,
  updatedAt: d(-4),
  status: 'active',
  locations: [
    location({
      id: 'cccccccc-0000-0000-0000-cccccccc0001',
      city: 'sulaymaniyah',
      address: 'Salim St, next to City Star',
      lat: 35.5613,
      lng: 45.4306,
      isPrimary: true,
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[2]!],
  kpis: kpis({ views30d: 2100, claims30d: 300, redemptions30d: 92, lastRedemptionAt: d(-1) }),
};

const STORE_ROJAVA: PrototypeSponsorStore = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  name: 'Rojava Gym',
  slug: 'rojava-gym',
  description: 'تاقیکردنەوەی ڕۆژانە بکە، پاشان بڕیار بدە. کۆد لە پێشوازیدا پیشان بدە.',
  logoUrl: 'https://placehold.co/120x120/png?text=RG',
  coverUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'duhok',
  phone: '+964 750 777 8888',
  whatsapp: '+964 750 777 8888',
  website: 'rojavagym.example',
  ownerUserId: null,
  sponsorTier: 'basic',
  isFeatured: false,
  updatedAt: d(-6),
  status: 'active',
  locations: [
    location({
      id: 'dddddddd-0000-0000-0000-dddddddd0001',
      city: 'duhok',
      address: 'Barzani Rd, 2nd floor',
      lat: 36.8663,
      lng: 42.9885,
      isPrimary: true,
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[5]!],
  kpis: kpis({ views30d: 740, claims30d: 80, redemptions30d: 31, lastRedemptionAt: d(-5) }),
};

const STORE_DISABLED: PrototypeSponsorStore = {
  id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  name: 'Old Partner (Disabled)',
  slug: 'old-partner-disabled',
  description: 'هذا المتجر معطّل في الدليل، لكن سجل القسائم محفوظ للثقة والدعم.',
  logoUrl: 'https://placehold.co/120x120/png?text=OFF',
  coverUrl: 'https://images.unsplash.com/photo-1520975958225-72c3d7c5a2ea?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'erbil',
  phone: null,
  whatsapp: null,
  website: null,
  ownerUserId: null,
  sponsorTier: 'basic',
  isFeatured: false,
  updatedAt: d(-20),
  status: 'disabled',
  locations: [location({ id: 'eeeeeeee-0000-0000-0000-eeeeeeee0001', city: 'erbil', address: '—', isPrimary: true })],
  categories: [PROTOTYPE_CATEGORIES[4]!],
  kpis: kpis({ views30d: 0, claims30d: 0, redemptions30d: 0, lastRedemptionAt: null }),
};

const STORE_MOCHA: PrototypeSponsorStore = {
  id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  name: 'Mocha Café',
  slug: 'mocha-cafe',
  description: 'قەهەوە و شیرینی. کۆدی KU BAZAR پیشان بدە بۆ داشکاندن.',
  logoUrl: 'https://placehold.co/120x120/png?text=MC',
  coverUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'erbil',
  phone: '+964 770 909 1010',
  whatsapp: '+964 770 909 1010',
  website: 'mochacafe.example',
  ownerUserId: null,
  sponsorTier: 'basic',
  isFeatured: false,
  updatedAt: d(-2),
  status: 'active',
  locations: [
    location({
      id: 'ffffffff-0000-0000-0000-ffffffff0001',
      city: 'erbil',
      address: 'Empire World, Ground floor',
      lat: 36.19,
      lng: 44.02,
      isPrimary: true,
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[4]!],
  kpis: kpis({ views30d: 1550, claims30d: 220, redemptions30d: 96, lastRedemptionAt: d(-0.6) }),
};

const STORE_NOVA_HOME: PrototypeSponsorStore = {
  id: 'abababab-abab-abab-abab-abababababab',
  name: 'Nova Home',
  slug: 'nova-home',
  description: 'أثاث عصري ولوازم منزلية. خصومات على قطع محددة.',
  logoUrl: 'https://placehold.co/120x120/png?text=NH',
  coverUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'duhok',
  phone: '+964 750 222 3333',
  whatsapp: '+964 750 222 3333',
  website: 'novahome.example',
  ownerUserId: null,
  sponsorTier: 'featured',
  isFeatured: true,
  updatedAt: d(-5),
  status: 'active',
  locations: [
    location({
      id: 'abababab-0000-0000-0000-abababab0001',
      city: 'duhok',
      address: 'Mall Road, Showroom #12',
      lat: 36.86,
      lng: 42.99,
      isPrimary: true,
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[3]!],
  kpis: kpis({ views30d: 880, claims30d: 95, redemptions30d: 33, lastRedemptionAt: d(-7) }),
};

const STORE_PIXEL_ZONE: PrototypeSponsorStore = {
  id: 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd',
  name: 'Pixel Zone Electronics',
  slug: 'pixel-zone',
  description: 'ئامێری یاری، هێدسێت و پێکهاتەکان — داشکاندنی خێرا لە شوێن.',
  logoUrl: 'https://placehold.co/120x120/png?text=PZ',
  coverUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80',
  primaryCity: 'zaxo',
  phone: '+964 750 444 5555',
  whatsapp: '+964 750 444 5555',
  website: 'pixelzone.example',
  ownerUserId: null,
  sponsorTier: 'basic',
  isFeatured: false,
  updatedAt: d(-1),
  status: 'active',
  locations: [
    location({
      id: 'cdcdcdcd-0000-0000-0000-cdcdcdcd0001',
      city: 'zaxo',
      address: 'Main Bazaar, Shop 22',
      lat: 37.14,
      lng: 42.69,
      isPrimary: true,
    }),
  ],
  categories: [PROTOTYPE_CATEGORIES[0]!],
  kpis: kpis({ views30d: 640, claims30d: 70, redemptions30d: 22, lastRedemptionAt: d(-3) }),
};

export const PROTOTYPE_STORES: PrototypeSponsorStore[] = [
  STORE_ZAIN,
  STORE_DARYA,
  STORE_SHAHR,
  STORE_ROJAVA,
  STORE_NOVA_HOME,
  STORE_MOCHA,
  STORE_PIXEL_ZONE,
  STORE_DISABLED,
];

const OFFER_ZAIN_ACCESSORIES: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000001',
  storeId: STORE_ZAIN.id,
  title: '20% off accessories (cases, chargers, power banks)',
  description: 'ينطبق على الإكسسوارات داخل المتجر فقط. لفترة محدودة.',
  terms: 'One voucher per person. Not valid with other promotions.',
  discountType: 'percent',
  discountValue: 20,
  currency: 'USD',
  startAt: d(-7),
  endAt: d(7),
  store: {
    id: STORE_ZAIN.id,
    name: STORE_ZAIN.name,
    slug: STORE_ZAIN.slug,
    logoUrl: STORE_ZAIN.logoUrl,
    primaryCity: STORE_ZAIN.primaryCity,
    phone: STORE_ZAIN.phone,
    whatsapp: STORE_ZAIN.whatsapp,
    website: STORE_ZAIN.website,
  },
  status: 'active',
  isFeatured: true,
  maxTotalRedemptions: 800,
  sampleVoucherCode: 'KU-8H2K-9T3Q',
  originalPrice: 150,
  dealPrice: 120,
  kpis: kpis({ views30d: 1920, claims30d: 260, redemptions30d: 110, lastRedemptionAt: d(-0.2) }),
};

const OFFER_ZAIN_REPAIR: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000002',
  storeId: STORE_ZAIN.id,
  title: 'Free screen protector with any repair',
  description: 'پەردەی شاشە لە شوێنەکەدا دەبەسترێت.',
  terms: 'Valid for repair orders above 25,000 IQD.',
  discountType: 'freebie',
  discountValue: null,
  currency: null,
  startAt: d(-2),
  endAt: d(3),
  store: {
    id: STORE_ZAIN.id,
    name: STORE_ZAIN.name,
    slug: STORE_ZAIN.slug,
    logoUrl: STORE_ZAIN.logoUrl,
    primaryCity: STORE_ZAIN.primaryCity,
    phone: STORE_ZAIN.phone,
    whatsapp: STORE_ZAIN.whatsapp,
    website: STORE_ZAIN.website,
  },
  status: 'active',
  isFeatured: false,
  maxTotalRedemptions: 250,
  sampleVoucherCode: 'KU-4P9X-1Z7M',
  originalPrice: null,
  dealPrice: null,
  kpis: kpis({ views30d: 870, claims30d: 120, redemptions30d: 54, lastRedemptionAt: d(-1) }),
};

const OFFER_DARYA_FIRST_VISIT: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000003',
  storeId: STORE_DARYA.id,
  title: '20% off first visit (haircut + styling)',
  description: 'للعملاء الجدد فقط. الحجز عبر الهاتف أو واتساب.',
  terms: 'Valid on weekdays only. One-time voucher.',
  discountType: 'percent',
  discountValue: 20,
  currency: 'USD',
  startAt: d(-10),
  endAt: d(14),
  store: {
    id: STORE_DARYA.id,
    name: STORE_DARYA.name,
    slug: STORE_DARYA.slug,
    logoUrl: STORE_DARYA.logoUrl,
    primaryCity: STORE_DARYA.primaryCity,
    phone: STORE_DARYA.phone,
    whatsapp: STORE_DARYA.whatsapp,
    website: STORE_DARYA.website,
  },
  status: 'active',
  isFeatured: true,
  maxTotalRedemptions: 500,
  sampleVoucherCode: 'KU-2D8N-6Q1R',
  originalPrice: 15,
  dealPrice: 12,
  kpis: kpis({ views30d: 1400, claims30d: 210, redemptions30d: 78, lastRedemptionAt: d(-0.8) }),
};

const OFFER_SHAHR_OIL: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000004',
  storeId: STORE_SHAHR.id,
  title: '20% off oil change + quick diagnostics',
  description: 'لەگەڵ چاودێری خێرا.',
  terms: 'Valid for cars only.',
  discountType: 'percent',
  discountValue: 20,
  currency: 'USD',
  startAt: d(-20),
  endAt: d(2),
  store: {
    id: STORE_SHAHR.id,
    name: STORE_SHAHR.name,
    slug: STORE_SHAHR.slug,
    logoUrl: STORE_SHAHR.logoUrl,
    primaryCity: STORE_SHAHR.primaryCity,
    phone: STORE_SHAHR.phone,
    whatsapp: STORE_SHAHR.whatsapp,
    website: STORE_SHAHR.website,
  },
  status: 'active',
  isFeatured: false,
  maxTotalRedemptions: 300,
  sampleVoucherCode: 'KU-7K5A-8B2C',
  originalPrice: 56,
  dealPrice: 45,
  kpis: kpis({ views30d: 620, claims30d: 80, redemptions30d: 29, lastRedemptionAt: d(-2) }),
};

const OFFER_ROJAVA_DAYPASS: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000005',
  storeId: STORE_ROJAVA.id,
  title: '19% off day pass (first visit)',
  description: 'جرّب تذكرة يوم واحد ثم قرّر. أحضر صديقك.',
  terms: 'Valid for new visitors only.',
  discountType: 'percent',
  discountValue: 19,
  currency: 'USD',
  startAt: d(-3),
  endAt: d(30),
  store: {
    id: STORE_ROJAVA.id,
    name: STORE_ROJAVA.name,
    slug: STORE_ROJAVA.slug,
    logoUrl: STORE_ROJAVA.logoUrl,
    primaryCity: STORE_ROJAVA.primaryCity,
    phone: STORE_ROJAVA.phone,
    whatsapp: STORE_ROJAVA.whatsapp,
    website: STORE_ROJAVA.website,
  },
  status: 'active',
  isFeatured: false,
  maxTotalRedemptions: null,
  sampleVoucherCode: 'KU-9X1H-0L2P',
  originalPrice: 110,
  dealPrice: 89,
  kpis: kpis({ views30d: 510, claims30d: 60, redemptions30d: 21, lastRedemptionAt: d(-4) }),
};

const OFFER_DISABLED_EXPIRED: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000006',
  storeId: STORE_DISABLED.id,
  title: '50% off (legacy offer)',
  description: 'نموونەی داگرتنی کە ئێستا چالاک نییە.',
  terms: 'This is a prototype example.',
  discountType: 'percent',
  discountValue: 50,
  currency: null,
  startAt: d(-60),
  endAt: d(-30),
  store: {
    id: STORE_DISABLED.id,
    name: STORE_DISABLED.name,
    slug: STORE_DISABLED.slug,
    logoUrl: STORE_DISABLED.logoUrl,
    primaryCity: STORE_DISABLED.primaryCity,
    phone: STORE_DISABLED.phone,
    whatsapp: STORE_DISABLED.whatsapp,
    website: STORE_DISABLED.website,
  },
  status: 'expired',
  isFeatured: false,
  maxTotalRedemptions: null,
  sampleVoucherCode: 'KU-LEGACY-0000',
  originalPrice: null,
  dealPrice: null,
  kpis: kpis({ views30d: 0, claims30d: 0, redemptions30d: 0, lastRedemptionAt: null }),
};

const OFFER_MOCHA: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000007',
  storeId: STORE_MOCHA.id,
  title: 'Buy 1 coffee, get 20% off dessert',
  description: 'مثالية للقاءات السريعة. العرض على قائمة الحلويات فقط.',
  terms: 'One voucher per visit. Valid on weekdays.',
  discountType: 'custom',
  discountValue: null,
  currency: null,
  startAt: d(-5),
  endAt: d(10),
  store: {
    id: STORE_MOCHA.id,
    name: STORE_MOCHA.name,
    slug: STORE_MOCHA.slug,
    logoUrl: STORE_MOCHA.logoUrl,
    primaryCity: STORE_MOCHA.primaryCity,
    phone: STORE_MOCHA.phone,
    whatsapp: STORE_MOCHA.whatsapp,
    website: STORE_MOCHA.website,
  },
  status: 'active',
  isFeatured: false,
  maxTotalRedemptions: 600,
  sampleVoucherCode: 'KU-1C0F-FEE1',
  originalPrice: null,
  dealPrice: null,
  kpis: kpis({ views30d: 1200, claims30d: 170, redemptions30d: 75, lastRedemptionAt: d(-0.6) }),
};

const OFFER_NOVA: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000008',
  storeId: STORE_NOVA_HOME.id,
  title: '10% off selected sofas',
  description: 'تەنها لەناو فروشگا. لە کارمەندانەوە پرسیار بکە.',
  terms: 'Not valid on clearance. While stock lasts.',
  discountType: 'percent',
  discountValue: 10,
  currency: null,
  startAt: d(-12),
  endAt: d(20),
  store: {
    id: STORE_NOVA_HOME.id,
    name: STORE_NOVA_HOME.name,
    slug: STORE_NOVA_HOME.slug,
    logoUrl: STORE_NOVA_HOME.logoUrl,
    primaryCity: STORE_NOVA_HOME.primaryCity,
    phone: STORE_NOVA_HOME.phone,
    whatsapp: STORE_NOVA_HOME.whatsapp,
    website: STORE_NOVA_HOME.website,
  },
  status: 'active',
  isFeatured: true,
  maxTotalRedemptions: 200,
  sampleVoucherCode: 'KU-50FA-1111',
  originalPrice: null,
  dealPrice: null,
  kpis: kpis({ views30d: 760, claims30d: 90, redemptions30d: 30, lastRedemptionAt: d(-7) }),
};

const OFFER_PIXEL: PrototypeSponsorOffer = {
  id: 'f0f0f0f0-0000-0000-0000-000000000009',
  storeId: STORE_PIXEL_ZONE.id,
  title: '15% off gaming accessories',
  description: 'سماعات، وحدات تحكم، وملحقات أخرى.',
  terms: 'One voucher per person. Limited time.',
  discountType: 'percent',
  discountValue: 15,
  currency: null,
  startAt: d(-1),
  endAt: d(12),
  store: {
    id: STORE_PIXEL_ZONE.id,
    name: STORE_PIXEL_ZONE.name,
    slug: STORE_PIXEL_ZONE.slug,
    logoUrl: STORE_PIXEL_ZONE.logoUrl,
    primaryCity: STORE_PIXEL_ZONE.primaryCity,
    phone: STORE_PIXEL_ZONE.phone,
    whatsapp: STORE_PIXEL_ZONE.whatsapp,
    website: STORE_PIXEL_ZONE.website,
  },
  status: 'active',
  isFeatured: false,
  maxTotalRedemptions: 350,
  sampleVoucherCode: 'KU-7G4M-1234',
  originalPrice: null,
  dealPrice: null,
  kpis: kpis({ views30d: 520, claims30d: 65, redemptions30d: 19, lastRedemptionAt: d(-3) }),
};

export const PROTOTYPE_OFFERS: PrototypeSponsorOffer[] = [
  OFFER_ZAIN_ACCESSORIES,
  OFFER_DARYA_FIRST_VISIT,
  OFFER_ZAIN_REPAIR,
  OFFER_SHAHR_OIL,
  OFFER_ROJAVA_DAYPASS,
  OFFER_NOVA,
  OFFER_MOCHA,
  OFFER_PIXEL,
  OFFER_DISABLED_EXPIRED,
];

export const PROTOTYPE_VOUCHERS: PrototypeVoucher[] = [
  {
    id: 'v1111111-1111-1111-1111-111111111111',
    code: OFFER_ZAIN_ACCESSORIES.sampleVoucherCode.replace(/[^A-Z0-9]/g, ''),
    status: 'active',
    claimedAt: d(-1),
    expiresAt: OFFER_ZAIN_ACCESSORIES.endAt,
    redeemedAt: null,
    store: {
      id: STORE_ZAIN.id,
      name: STORE_ZAIN.name,
      slug: STORE_ZAIN.slug,
      logoUrl: STORE_ZAIN.logoUrl,
      primaryCity: STORE_ZAIN.primaryCity,
    },
    offer: {
      id: OFFER_ZAIN_ACCESSORIES.id,
      title: OFFER_ZAIN_ACCESSORIES.title,
      discountType: OFFER_ZAIN_ACCESSORIES.discountType,
      discountValue: OFFER_ZAIN_ACCESSORIES.discountValue,
      currency: OFFER_ZAIN_ACCESSORIES.currency,
    },
  },
  {
    id: 'v2222222-2222-2222-2222-222222222222',
    code: OFFER_DARYA_FIRST_VISIT.sampleVoucherCode.replace(/[^A-Z0-9]/g, ''),
    status: 'redeemed',
    claimedAt: d(-12),
    expiresAt: OFFER_DARYA_FIRST_VISIT.endAt,
    redeemedAt: d(-8),
    store: {
      id: STORE_DARYA.id,
      name: STORE_DARYA.name,
      slug: STORE_DARYA.slug,
      logoUrl: STORE_DARYA.logoUrl,
      primaryCity: STORE_DARYA.primaryCity,
    },
    offer: {
      id: OFFER_DARYA_FIRST_VISIT.id,
      title: OFFER_DARYA_FIRST_VISIT.title,
      discountType: OFFER_DARYA_FIRST_VISIT.discountType,
      discountValue: OFFER_DARYA_FIRST_VISIT.discountValue,
      currency: OFFER_DARYA_FIRST_VISIT.currency,
    },
  },
  {
    id: 'v3333333-3333-3333-3333-333333333333',
    code: OFFER_DISABLED_EXPIRED.sampleVoucherCode.replace(/[^A-Z0-9]/g, ''),
    status: 'void',
    claimedAt: d(-80),
    expiresAt: OFFER_DISABLED_EXPIRED.endAt,
    redeemedAt: null,
    store: {
      id: STORE_DISABLED.id,
      name: STORE_DISABLED.name,
      slug: STORE_DISABLED.slug,
      logoUrl: STORE_DISABLED.logoUrl,
      primaryCity: STORE_DISABLED.primaryCity,
    },
    offer: {
      id: OFFER_DISABLED_EXPIRED.id,
      title: OFFER_DISABLED_EXPIRED.title,
      discountType: OFFER_DISABLED_EXPIRED.discountType,
      discountValue: OFFER_DISABLED_EXPIRED.discountValue,
      currency: OFFER_DISABLED_EXPIRED.currency,
    },
  },
  {
    id: 'v4444444-4444-4444-4444-444444444444',
    code: OFFER_NOVA.sampleVoucherCode.replace(/[^A-Z0-9]/g, ''),
    status: 'active',
    claimedAt: d(-3),
    expiresAt: OFFER_NOVA.endAt,
    redeemedAt: null,
    store: {
      id: STORE_NOVA_HOME.id,
      name: STORE_NOVA_HOME.name,
      slug: STORE_NOVA_HOME.slug,
      logoUrl: STORE_NOVA_HOME.logoUrl,
      primaryCity: STORE_NOVA_HOME.primaryCity,
    },
    offer: {
      id: OFFER_NOVA.id,
      title: OFFER_NOVA.title,
      discountType: OFFER_NOVA.discountType,
      discountValue: OFFER_NOVA.discountValue,
      currency: OFFER_NOVA.currency,
    },
  },
];

export const PROTOTYPE_STAFF: PrototypeStaffMember[] = [
  {
    id: 's1111111-1111-1111-1111-111111111111',
    storeId: STORE_ZAIN.id,
    userId: 'u1111111-1111-1111-1111-111111111111',
    displayName: 'Zain Phones • Manager',
    email: 'manager@zainphones.example',
    phone: '+964 750 111 0000',
    role: 'manager',
    status: 'active',
    createdAt: d(-120),
  },
  {
    id: 's2222222-2222-2222-2222-222222222222',
    storeId: STORE_ZAIN.id,
    userId: 'u2222222-2222-2222-2222-222222222222',
    displayName: 'Zain Phones • Cashier',
    email: 'cashier@zainphones.example',
    phone: '+964 750 111 0001',
    role: 'cashier',
    status: 'active',
    createdAt: d(-30),
  },
  {
    id: 's3333333-3333-3333-3333-333333333333',
    storeId: STORE_DARYA.id,
    userId: 'u3333333-3333-3333-3333-333333333333',
    displayName: 'Darya Beauty • Cashier',
    email: 'frontdesk@daryabeauty.example',
    phone: '+964 750 555 0000',
    role: 'cashier',
    status: 'active',
    createdAt: d(-80),
  },
  {
    id: 's4444444-4444-4444-4444-444444444444',
    storeId: STORE_SHAHR.id,
    userId: 'u4444444-4444-4444-4444-444444444444',
    displayName: 'Shahr Service • Cashier (Disabled)',
    email: 'oldstaff@shahrservice.example',
    phone: null,
    role: 'cashier',
    status: 'disabled',
    createdAt: d(-200),
  },
];

export function listPrototypeStores(): PrototypeSponsorStore[] {
  return PROTOTYPE_STORES.slice();
}

export function listPrototypeOffers(): PrototypeSponsorOffer[] {
  return PROTOTYPE_OFFERS.slice();
}

export function listPrototypeTopOffers(): PrototypeSponsorOffer[] {
  return PROTOTYPE_OFFERS.filter((o) => o.status === 'active').slice(0, 8);
}

export function listPrototypeFeaturedStores(): PrototypeSponsorStore[] {
  return PROTOTYPE_STORES.filter((s) => s.status === 'active' && s.isFeatured);
}

export function getPrototypeStoreBySlug(slug: string): PrototypeSponsorStore | null {
  const normalized = slug.trim().toLowerCase();
  return PROTOTYPE_STORES.find((s) => s.slug.toLowerCase() === normalized) ?? null;
}

export function listPrototypeOffersByStoreId(storeId: string): PrototypeSponsorOffer[] {
  return PROTOTYPE_OFFERS.filter((o) => o.storeId === storeId);
}

export function getPrototypeOfferById(id: string): PrototypeSponsorOffer | null {
  return PROTOTYPE_OFFERS.find((o) => o.id === id) ?? null;
}

export function getPrototypeVoucherById(id: string): PrototypeVoucher | null {
  return PROTOTYPE_VOUCHERS.find((v) => v.id === id) ?? null;
}

export function getPrototypeVoucherByOfferId(offerId: string): PrototypeVoucher | null {
  return PROTOTYPE_VOUCHERS.find((v) => v.offer.id === offerId) ?? null;
}

export function listPrototypeStaffByStoreId(storeId: string): PrototypeStaffMember[] {
  return PROTOTYPE_STAFF.filter((s) => s.storeId === storeId);
}
