import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PROPERTY_CATEGORY_ID } from '@/data/category-ui-config.js';

import { createProductSchema } from '../schemas.js';

const sellerId = '11111111-1111-4111-8111-111111111111';
const productImagePath = `${sellerId}/test-image-full.webp`;

const baseListing = {
  title: 'Test listing',
  description: 'A local validation regression test listing.',
  price: '15000',
  currency: 'IQD',
  condition: 'Used - Good',
  categoryId: '22222222-2222-4222-8222-222222222222',
  listingType: 'sale',
  location: 'Erbil',
  images: [productImagePath],
  sellerId,
};

describe('createProductSchema', () => {
  it('accepts null rentalTerm for normal sale listings', () => {
    const result = createProductSchema.safeParse({
      ...baseListing,
      rentalTerm: null,
    });

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.rentalTerm, null);
    assert.equal(result.data.listingType, 'sale');
  });

  it('still requires rentalTerm for rental property listings', () => {
    const result = createProductSchema.safeParse({
      ...baseListing,
      categoryId: PROPERTY_CATEGORY_ID,
      condition: '',
      listingType: 'rent',
      rentalTerm: null,
    });

    assert.equal(result.success, false);
    if (result.success) return;
    assert.equal(result.error.issues.some((issue) => issue.path.join('.') === 'rentalTerm'), true);
  });
});
