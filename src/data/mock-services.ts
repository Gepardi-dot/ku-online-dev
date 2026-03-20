export type MockServiceType =
  | 'electrician'
  | 'ac-repair'
  | 'plumber'
  | 'cleaning'
  | 'movers'
  | 'phone-repair'
  | 'beauty-at-home'
  | 'car-wash';

export type MockServiceDeliveryMode = 'at-home' | 'in-shop' | 'both';

export type MockServicePricingModel = 'starting' | 'visit-fee' | 'fixed';

export type MockServiceProvider = {
  id: string;
  title: string;
  providerName: string;
  serviceType: MockServiceType;
  city: string;
  area: string;
  startingPrice: number;
  pricingModel: MockServicePricingModel;
  rating: number;
  reviewCount: number;
  responseMinutes: number;
  verified: boolean;
  availableToday: boolean;
  featured: boolean;
  deliveryMode: MockServiceDeliveryMode;
  experienceYears: number;
  completedJobs: number;
  galleryCount: number;
  description: string;
  highlight: string;
  imageUrl: string;
  phone: string;
  tags: string[];
  searchTerms: string[];
};

export const MOCK_SERVICE_TYPE_LABELS: Record<MockServiceType, string> = {
  electrician: 'Electrician',
  'ac-repair': 'AC Repair',
  plumber: 'Plumber',
  cleaning: 'Cleaning',
  movers: 'Movers',
  'phone-repair': 'Phone Repair',
  'beauty-at-home': 'Beauty at Home',
  'car-wash': 'Car Wash',
};

export const mockServiceProviders: MockServiceProvider[] = [
  {
    id: 'svc-ankawa-electric',
    title: 'Emergency electrical fixes and apartment rewiring',
    providerName: 'Soran Fast Electric',
    serviceType: 'electrician',
    city: 'Erbil',
    area: 'Ankawa',
    startingPrice: 25000,
    pricingModel: 'visit-fee',
    rating: 4.9,
    reviewCount: 87,
    responseMinutes: 8,
    verified: true,
    availableToday: true,
    featured: true,
    deliveryMode: 'at-home',
    experienceYears: 9,
    completedJobs: 420,
    galleryCount: 26,
    description:
      'Fast electrician for power loss, breaker issues, switches, socket replacements, and full apartment rewiring.',
    highlight: 'Popular for same-day apartment calls',
    imageUrl:
      'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647501112233',
    tags: ['Same day', 'Before/after photos', 'Home visit'],
    searchTerms: ['electrician', 'electrical', 'kahrabai', 'كهربائي', 'کارەبا'],
  },
  {
    id: 'svc-erbil-ac',
    title: 'Home AC cleaning, refill, and cooling recovery',
    providerName: 'CoolFix AC Care',
    serviceType: 'ac-repair',
    city: 'Erbil',
    area: '32 Park',
    startingPrice: 40000,
    pricingModel: 'starting',
    rating: 4.8,
    reviewCount: 62,
    responseMinutes: 12,
    verified: true,
    availableToday: true,
    featured: true,
    deliveryMode: 'at-home',
    experienceYears: 7,
    completedJobs: 296,
    galleryCount: 18,
    description:
      'AC maintenance for split units, gas refill, drainage fixes, and weak-cooling diagnosis for homes and small offices.',
    highlight: 'High repeat demand before summer',
    imageUrl:
      'https://images.unsplash.com/photo-1581092919535-7146ff1a590e?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647502223344',
    tags: ['Cooling check', 'Gas refill', 'At home'],
    searchTerms: ['ac', 'air conditioning', 'cooling', 'تبريد', 'مكيف', 'کۆلینگ'],
  },
  {
    id: 'svc-baghdad-plumber',
    title: 'Leak repair, water heater checks, and pipe replacement',
    providerName: 'Zaxo Pipe Rescue',
    serviceType: 'plumber',
    city: 'Zaxo',
    area: 'Newroz',
    startingPrice: 30000,
    pricingModel: 'visit-fee',
    rating: 4.7,
    reviewCount: 71,
    responseMinutes: 15,
    verified: true,
    availableToday: true,
    featured: false,
    deliveryMode: 'at-home',
    experienceYears: 11,
    completedJobs: 510,
    galleryCount: 14,
    description:
      'Trusted plumber for leaks, blocked drains, bathroom fittings, pressure issues, and quick home diagnostics.',
    highlight: 'Strong ratings on emergency leak calls',
    imageUrl:
      'https://images.unsplash.com/photo-1621905252472-e8c85b0ddf3d?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647703304455',
    tags: ['Emergency', 'Water heater', 'Home visit'],
    searchTerms: ['plumber', 'pipes', 'leak', 'سباك', 'ماء', 'ئاو'],
  },
  {
    id: 'svc-suli-cleaning',
    title: 'Deep cleaning for homes, offices, and move-out handovers',
    providerName: 'Shine Home Crew',
    serviceType: 'cleaning',
    city: 'Silemaniy',
    area: 'Salim Street',
    startingPrice: 35000,
    pricingModel: 'starting',
    rating: 4.9,
    reviewCount: 112,
    responseMinutes: 20,
    verified: true,
    availableToday: false,
    featured: true,
    deliveryMode: 'at-home',
    experienceYears: 6,
    completedJobs: 610,
    galleryCount: 33,
    description:
      'Detail-focused team for kitchens, bathrooms, sofas, office spaces, and post-renovation cleanup with before/after shots.',
    highlight: 'Best review volume in mock data',
    imageUrl:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647704405566',
    tags: ['Deep clean', 'Move-out', 'Before/after photos'],
    searchTerms: ['cleaning', 'housekeeping', 'maid', 'تنظيف', 'خاوێنکردنەوە'],
  },
  {
    id: 'svc-duhok-movers',
    title: 'Apartment moves with packing, loading, and careful handling',
    providerName: 'MoveEasy Team',
    serviceType: 'movers',
    city: 'Duhok',
    area: 'Malta',
    startingPrice: 85000,
    pricingModel: 'fixed',
    rating: 4.6,
    reviewCount: 49,
    responseMinutes: 28,
    verified: true,
    availableToday: false,
    featured: false,
    deliveryMode: 'at-home',
    experienceYears: 8,
    completedJobs: 188,
    galleryCount: 11,
    description:
      'Moving team for apartments and small businesses, including packing help, stairs carry, and short-distance city moves.',
    highlight: 'Clear fixed pricing for local moves',
    imageUrl:
      'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647505556677',
    tags: ['Packing help', 'Local moving', 'Furniture handling'],
    searchTerms: ['movers', 'moving', 'transport', 'نقل', 'گواستنەوە'],
  },
  {
    id: 'svc-erbil-phone',
    title: 'iPhone and Android screen, battery, and charging repair',
    providerName: 'Phone Lab Erbil',
    serviceType: 'phone-repair',
    city: 'Erbil',
    area: 'Downtown',
    startingPrice: 20000,
    pricingModel: 'starting',
    rating: 4.8,
    reviewCount: 93,
    responseMinutes: 10,
    verified: true,
    availableToday: true,
    featured: false,
    deliveryMode: 'both',
    experienceYears: 5,
    completedJobs: 740,
    galleryCount: 21,
    description:
      'Phone repair shop handling screen replacements, battery swaps, charging ports, camera faults, and quick diagnostics.',
    highlight: 'Fastest turnaround for walk-in repairs',
    imageUrl:
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647506667788',
    tags: ['Walk-in', 'Battery swap', 'Pickup available'],
    searchTerms: ['phone repair', 'screen', 'iphone', 'تصليح موبايل', 'مۆبایل'],
  },
  {
    id: 'svc-baghdad-beauty',
    title: 'At-home makeup, hair styling, and event-ready beauty visits',
    providerName: 'Luna Beauty Visits',
    serviceType: 'beauty-at-home',
    city: 'Duhok',
    area: 'Baroshke',
    startingPrice: 60000,
    pricingModel: 'starting',
    rating: 4.9,
    reviewCount: 38,
    responseMinutes: 18,
    verified: false,
    availableToday: true,
    featured: false,
    deliveryMode: 'at-home',
    experienceYears: 4,
    completedJobs: 126,
    galleryCount: 29,
    description:
      'Beauty-at-home service for events, engagement prep, soft glam makeup, and hair styling with portfolio references.',
    highlight: 'Strong visual portfolio and repeat bookings',
    imageUrl:
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647707778899',
    tags: ['At home', 'Events', 'Portfolio heavy'],
    searchTerms: ['beauty', 'makeup', 'hair', 'صالون', 'مكياج', 'جوانکاری'],
  },
  {
    id: 'svc-mosul-carwash',
    title: 'Doorstep car wash, interior detailing, and quick polishing',
    providerName: 'RinseGo Mobile Wash',
    serviceType: 'car-wash',
    city: 'Erbil',
    area: 'Empire',
    startingPrice: 15000,
    pricingModel: 'fixed',
    rating: 4.7,
    reviewCount: 56,
    responseMinutes: 22,
    verified: true,
    availableToday: true,
    featured: false,
    deliveryMode: 'at-home',
    experienceYears: 3,
    completedJobs: 264,
    galleryCount: 17,
    description:
      'Mobile car wash service for exterior wash, interior vacuuming, light detailing, and quick polish at your location.',
    highlight: 'Low-friction service for repeat bookings',
    imageUrl:
      'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1200&q=80',
    phone: '+9647508889900',
    tags: ['Doorstep', 'Interior clean', 'Quick booking'],
    searchTerms: ['car wash', 'detailing', 'wash', 'غسل سيارات', 'ئۆتۆمبێل'],
  },
];
