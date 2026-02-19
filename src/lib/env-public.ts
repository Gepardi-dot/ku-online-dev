import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((value) => value === 'true');

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function boundedIntegerFromEnv(fallback: number, min: number, max: number) {
  return z.preprocess((value) => {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
      return fallback;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }, z.number().int().min(min).max(max));
}

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: z
    .string()
    .min(1)
    .default('product-images'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_PWA_ENABLED: booleanFromEnv,
  NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((value) => value === 'true'),
  NEXT_PUBLIC_PWA_PUSH_ENABLED: booleanFromEnv,
  NEXT_PUBLIC_PWA_TELEMETRY_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((value) => value === 'true'),
  NEXT_PUBLIC_PWA_ROLLOUT_PERCENT: boundedIntegerFromEnv(100, 0, 100),
  NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_PARTNERSHIPS_EMAIL: z.string().email().optional(),
  NEXT_PUBLIC_PARTNERSHIPS_WHATSAPP: z.string().min(3).optional(),
});

type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cached) {
    return cached;
  }

  const result = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_PWA_ENABLED: process.env.NEXT_PUBLIC_PWA_ENABLED,
    NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED: process.env.NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED,
    NEXT_PUBLIC_PWA_PUSH_ENABLED: process.env.NEXT_PUBLIC_PWA_PUSH_ENABLED,
    NEXT_PUBLIC_PWA_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_PWA_TELEMETRY_ENABLED,
    NEXT_PUBLIC_PWA_ROLLOUT_PERCENT: process.env.NEXT_PUBLIC_PWA_ROLLOUT_PERCENT,
    NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_PARTNERSHIPS_EMAIL: process.env.NEXT_PUBLIC_PARTNERSHIPS_EMAIL,
    NEXT_PUBLIC_PARTNERSHIPS_WHATSAPP: process.env.NEXT_PUBLIC_PARTNERSHIPS_WHATSAPP,
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Invalid public environment variables', errors);
    }
    throw new Error('Invalid or missing public environment variables');
  }

  const normalizedSiteUrl = result.data.NEXT_PUBLIC_SITE_URL
    ? result.data.NEXT_PUBLIC_SITE_URL.replace('://0.0.0.0', '://localhost')
    : result.data.NEXT_PUBLIC_SITE_URL;

  cached = {
    ...result.data,
    NEXT_PUBLIC_SITE_URL: normalizedSiteUrl,
    NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET:
      result.data.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images',
  } satisfies PublicEnv;

  return cached;
}

export type { PublicEnv };
