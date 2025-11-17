export const CATEGORY_LABEL_ORDER = [
  'Smartphones and iPads',
  'Fashion',
  'Electronics',
  'Sports',
  'Home Appliance',
  'Kids & Toys',
  'Furniture',
  'Services',
  'Cars',
  'Property',
  'Free',
  'Others',
];

export type RawCategoryRow = {
  id: string;
  name: string | null;
};

export type CategoryOption = {
  id: string;
  name: string;
};

function normalizeCategoryLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  const value = name.toLowerCase();

  if (value.includes('smartphone')) return 'Smartphones and iPads';
  if (value === 'fashion') return 'Fashion';
  if (value === 'electronics') return 'Electronics';
  if (value === 'sports' || value === 'sports & outdoors') return 'Sports';
  if (value === 'home appliance' || value === 'home & garden' || value === 'home & living') {
    return 'Home Appliance';
  }
  if (value.startsWith('kids') || value.includes('toys')) return 'Kids & Toys';
  if (value === 'furniture') return 'Furniture';
  if (value === 'services' || value === 'service') return 'Services';
  if (value === 'cars' || value === 'motors' || value === 'vehicles' || value.includes('vehicle')) {
    return 'Cars';
  }
  if (value === 'property' || value === 'real estate' || value.includes('property')) {
    return 'Property';
  }
  if (value === 'free') return 'Free';
  if (value === 'others' || value === 'other') return 'Others';

  return null;
}

export function mapCategoriesForUi(rows: RawCategoryRow[]): CategoryOption[] {
  const byLabel = new Map<string, CategoryOption>();

  for (const row of rows) {
    const label = normalizeCategoryLabel(row.name);
    if (!label) continue;
    if (!byLabel.has(label)) {
      byLabel.set(label, { id: row.id, name: label });
    }
  }

  const result: CategoryOption[] = [];
  for (const label of CATEGORY_LABEL_ORDER) {
    const entry = byLabel.get(label);
    if (entry) {
      result.push(entry);
    }
  }

  return result;
}

