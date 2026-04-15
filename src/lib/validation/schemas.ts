import { z } from 'zod';

import { PROPERTY_CATEGORY_ID } from '@/data/category-ui-config';
import { CONDITION_VALUES } from '@/lib/products/filter-params';
import { PRODUCT_LISTING_TYPE_VALUES, PROPERTY_RENTAL_TERM_VALUES } from '@/lib/products/property-listing';
import { isAllowedProductImageInput } from '@/lib/storage-public';

const phoneRegex = /^[+0-9()\-\s]{6,20}$/;

export const productConditionEnum = z.enum(CONDITION_VALUES);
export const productCurrencyEnum = z.enum(['IQD', 'USD']);
export const productListingTypeEnum = z.enum(PRODUCT_LISTING_TYPE_VALUES);
export const propertyRentalTermEnum = z.enum(PROPERTY_RENTAL_TERM_VALUES);

const descriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Description must be 1000 characters or fewer.')
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

export const createProductSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Title must be at least 3 characters long.')
      .max(140, 'Title must be 140 characters or fewer.'),
    description: descriptionSchema,
    price: z.coerce
      .number({ error: 'Price must be a number.' })
      .min(0, 'Price must be zero or greater.'),
    currency: productCurrencyEnum.default('IQD'),
    condition: z
      .union([productConditionEnum, z.literal('')])
      .optional()
      .transform((value) => {
        if (!value) return null;
        return value;
      }),
    categoryId: z.string().trim().min(1, { message: 'Select a valid category.' }),
    listingType: productListingTypeEnum.default('sale'),
    rentalTerm: z
      .union([propertyRentalTermEnum, z.literal('')])
      .optional()
      .transform((value) => {
        if (!value) return null;
        return value;
      }),
    location: z
      .string()
      .trim()
      .min(2, 'Location is required.')
      .max(120, 'Location must be 120 characters or fewer.'),
    images: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Image URL is required.')
          .refine(isAllowedProductImageInput, 'Images must be stored in Supabase Storage.'),
      )
      .min(1, 'Add at least one image.')
      .max(5, 'You can upload up to 5 images.'),
    sellerId: z.string().uuid(),
    color: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .superRefine((value, ctx) => {
    const isProperty = value.categoryId === PROPERTY_CATEGORY_ID;

    if (isProperty) {
      if (value.listingType === 'rent' && !value.rentalTerm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rentalTerm'],
          message: 'Choose a rental term.',
        });
      }
      return;
    }

    if (!value.condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['condition'],
        message: 'Select a condition.',
      });
    }

    if (value.listingType !== 'sale') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['listingType'],
        message: 'Only property listings can be marked for rent.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    description: value.description ?? null,
    rentalTerm: value.listingType === 'rent' ? value.rentalTerm ?? null : null,
  }));

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters long.')
    .max(120, 'Full name must be 120 characters or fewer.'),
  avatarUrl: z
    .union([z.string().url('Avatar URL must be valid.'), z.null()])
    .optional()
    .default(null),
  phone: z
    .union([z.string().trim().regex(phoneRegex, 'Enter a valid phone number.').max(20), z.null()])
    .transform((value) => (value === null ? null : value))
    .optional()
    .default(null),
  location: z
    .union([z.string().trim().max(120, 'Location must be 120 characters or fewer.'), z.null()])
    .transform((value) => (value === null ? null : value))
    .optional()
    .default(null),
  bio: z
    .union([z.string().trim().max(500, 'Bio must be 500 characters or fewer.'), z.null()])
    .transform((value) => (value === null ? null : value))
    .optional()
    .default(null),
  notifyMessages: z.boolean(),
  notifyOffers: z.boolean(),
  notifyUpdates: z.boolean(),
  notifyAnnouncements: z.boolean().default(false),
  marketingEmails: z.boolean(),
  preferredLanguage: z.enum(['en', 'ar', 'ku']).default('en'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  receiverId: z.string().uuid(),
  productId: z
    .union([z.string().uuid(), z.null(), z.undefined()])
    .transform((value) => (value ? value : null)),
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(1000, 'Message is too long.'),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
