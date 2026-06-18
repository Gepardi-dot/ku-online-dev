export type CategoryUiConfig = {
  key: string;
  label: string;
  labelAr?: string;
  labelKu?: string;
  icon: string;
  matchNames: string[];
};

export const SPONSORS_CATEGORY_ID = '00000000-0000-0000-0000-00000000000d';
export const PROPERTY_CATEGORY_ID = '00000000-0000-0000-0000-00000000000a';

export const CATEGORY_UI_CONFIG: CategoryUiConfig[] = [
  {
    key: 'smartphones-ipads',
    label: 'Smartphones and iPads',
    labelAr: 'الهواتف والأيباد',
    labelKu: 'مۆبایل و ئایپاد',
    icon: '/optimized/category-icons/smartphones-ipads.webp',
    matchNames: ['smartphones and ipads', 'smartphones', 'smartphone'],
  },
  {
    key: 'sponsors',
    label: 'Stores and Sponsors',
    labelAr: 'المحلات والرعاة',
    labelKu: 'فرۆشگاکان و سپۆنسەرەکان',
    icon: '/optimized/category-icons/sponsors.webp',
    matchNames: [
      'stores and sponsors',
      'stores & sponsors',
      'stores',
      'sponsors',
      'store',
      'sponsor',
    ],
  },
  {
    key: 'fashion',
    label: 'Fashion',
    labelAr: 'أزياء',
    labelKu: 'فەشن',
    icon: '/optimized/category-icons/fashion.webp',
    matchNames: ['fashion'],
  },
  {
    key: 'electronics',
    label: 'Electronics',
    labelAr: 'إلكترونيات',
    labelKu: 'ئێلێکترۆنیات',
    icon: '/optimized/category-icons/electronics.webp',
    matchNames: ['electronics'],
  },
  {
    key: 'sports',
    label: 'Sports',
    labelAr: 'رياضة',
    labelKu: 'وەرزشی',
    icon: '/optimized/category-icons/sports.webp',
    matchNames: ['sports'],
  },
  {
    key: 'home-appliance',
    label: 'Home Appliance',
    labelAr: 'أجهزة منزلية',
    labelKu: 'کەرەساتی ناو ماڵ',
    icon: '/optimized/category-icons/home-appliance.webp',
    matchNames: ['home appliance', 'home & garden', 'home and garden'],
  },
  {
    key: 'kids-toys',
    label: 'Kids & Toys',
    labelAr: 'ألعاب الأطفال',
    labelKu: 'منداڵ و یاریەکان',
    icon: '/optimized/category-icons/kids-toys.webp',
    matchNames: ['kids & toys', 'kids and toys', 'toys'],
  },
  {
    key: 'furniture',
    label: 'Furniture',
    labelAr: 'أثاث',
    labelKu: 'کەلوپەلی ناو ماڵ',
    icon: '/optimized/category-icons/furniture.webp',
    matchNames: ['furniture'],
  },
  {
    key: 'services',
    label: 'Services',
    labelAr: 'خدمات',
    labelKu: 'خزمەتگوزاری',
    icon: '/optimized/category-icons/services.webp',
    matchNames: ['services'],
  },
  {
    key: 'cars',
    label: 'Cars',
    labelAr: 'سيارات',
    labelKu: 'ئۆتۆمبێل',
    icon: '/optimized/category-icons/cars.webp',
    matchNames: ['cars', 'motors', 'vehicles'],
  },
  {
    key: 'property',
    label: 'Property',
    labelAr: 'عقارات',
    labelKu: 'خانوو',
    icon: '/optimized/category-icons/property.webp',
    matchNames: ['property', 'real estate'],
  },
  {
    key: 'free',
    label: 'Free',
    labelAr: 'مجاني',
    labelKu: 'بێبەرامبەر',
    icon: '/optimized/category-icons/free.webp',
    matchNames: ['free'],
  },
  {
    key: 'others',
    label: 'Others',
    labelAr: 'أخرى',
    labelKu: 'هیتر',
    icon: '/optimized/category-icons/others.webp',
    matchNames: ['others'],
  },
];

export const CATEGORY_ICON_MAP: Record<string, string> = CATEGORY_UI_CONFIG.reduce(
  (acc, config) => {
    for (const name of config.matchNames) {
      acc[name.toLowerCase()] = config.icon;
    }
    return acc;
  },
  {} as Record<string, string>,
);

export const CATEGORY_LABEL_MAP: Record<string, CategoryUiConfig> = CATEGORY_UI_CONFIG.reduce(
  (acc, config) => {
    for (const name of config.matchNames) {
      acc[name.toLowerCase()] = config;
    }
    return acc;
  },
  {} as Record<string, CategoryUiConfig>,
);

export const CATEGORY_BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4BwQACfsD/QwZk48AAAAASUVORK5CYII=';
