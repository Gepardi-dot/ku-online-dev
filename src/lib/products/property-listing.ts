import { PROPERTY_CATEGORY_ID } from '@/data/category-ui-config';

export const PRODUCT_LISTING_TYPE_VALUES = ['sale', 'rent'] as const;
export const PROPERTY_RENTAL_TERM_VALUES = ['daily', 'monthly'] as const;

export type ProductListingType = (typeof PRODUCT_LISTING_TYPE_VALUES)[number];
export type PropertyRentalTerm = (typeof PROPERTY_RENTAL_TERM_VALUES)[number];

export function normalizeProductListingType(value: string | null | undefined): ProductListingType {
  return value === 'rent' ? 'rent' : 'sale';
}

export function normalizePropertyRentalTerm(value: string | null | undefined): PropertyRentalTerm | null {
  return value === 'daily' || value === 'monthly' ? value : null;
}

export function isPropertyCategoryName(value: string | null | undefined): boolean {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return false;
  }

  return normalized === 'property' || normalized === 'real estate' || normalized.includes('property');
}

export function isPropertyCategory(categoryId: string | null | undefined, categoryName?: string | null | undefined): boolean {
  return categoryId === PROPERTY_CATEGORY_ID || isPropertyCategoryName(categoryName);
}

export function isRentListing(value: string | null | undefined): boolean {
  return normalizeProductListingType(value) === 'rent';
}
