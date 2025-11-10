#!/usr/bin/env node
import { z } from 'zod';

const baseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: z
    .string()
    .min(1)
    .default('product-images'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const serverSchema = baseSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  ADMIN_REVALIDATE_TOKEN: z.string().min(1, 'ADMIN_REVALIDATE_TOKEN is required').optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

const result = serverSchema.safeParse(process.env);

if (!result.success) {
  console.error('Environment validation failed');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

const env = {
  ...result.data,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET:
    result.data.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images',
};

if (!env.ADMIN_REVALIDATE_TOKEN) {
  if (process.env.NODE_ENV === 'production') {
    console.error('ADMIN_REVALIDATE_TOKEN is required in production environments');
    process.exit(1);
  }
  console.warn('ADMIN_REVALIDATE_TOKEN is not set. Admin revalidation endpoint will reject requests.');
}

console.log('Environment variables look good.');
