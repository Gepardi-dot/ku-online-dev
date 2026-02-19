import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((value) => value === 'true');

const booleanTrueDefaultFromEnv = z
  .enum(['true', 'false'])
  .optional()
  .default('true')
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

const optionalUrlFromEnv = z.preprocess(
  (value) => normalizeOptionalString(value),
  z.string().url().optional(),
);

const optionalSecretFromEnv = z.preprocess(
  (value) => normalizeOptionalString(value),
  z.string().min(1).optional(),
);

const baseSchema = z.object({
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

const serverSchema = baseSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  ADMIN_REVALIDATE_TOKEN: z.string().min(1, 'ADMIN_REVALIDATE_TOKEN is required').optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  ALGOLIA_APP_ID: z.string().min(1).optional(),
  ALGOLIA_ADMIN_API_KEY: z.string().min(1).optional(),
  ALGOLIA_SEARCH_API_KEY: z.string().min(1).optional(),
  ALGOLIA_INDEX_NAME: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  VONAGE_API_KEY: z.string().min(1).optional(),
  VONAGE_API_SECRET: z.string().min(1).optional(),
  VONAGE_APPLICATION_ID: z.string().min(1).optional(),
  VONAGE_PRIVATE_KEY64: z.string().min(1).optional(),
  VONAGE_VIRTUAL_NUMBER: z.string().min(1).optional(),
  VONAGE_SMS_SENDER_ID: z.string().min(1).optional(),
  VONAGE_SMS_TEMPLATE: z.string().min(1).optional(),
  SUPABASE_SMS_HOOK_SECRET: z.string().min(1).optional(),
  PARTNERSHIPS_NOTIFY_EMAIL: z.string().email().optional(),
  PARTNERSHIPS_FROM_EMAIL: z.string().email().optional(),
  PWA_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  PWA_TELEMETRY_DURABLE_ENABLED: booleanTrueDefaultFromEnv,
  PWA_TELEMETRY_SUMMARY_MAX_ROWS: boundedIntegerFromEnv(15_000, 1_000, 50_000),
  PWA_TELEMETRY_RETENTION_DAYS: boundedIntegerFromEnv(14, 1, 90),
  PWA_SLO_ALERT_WEBHOOK_URL: optionalUrlFromEnv,
  PWA_SLO_ALERT_SECRET: optionalSecretFromEnv,
  PWA_SLO_ALERT_COOLDOWN_MINUTES: boundedIntegerFromEnv(30, 1, 24 * 60),
  PWA_SLO_ALERT_TIMEOUT_MS: boundedIntegerFromEnv(8_000, 1_000, 30_000),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cachedEnv: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = serverSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    if (process.env.NODE_ENV === 'test') {
      console.warn('Invalid environment variables in test environment', errors);
    } else {
      console.error('Invalid environment variables', errors);
    }
    throw new Error('Invalid or missing environment variables');
  }

  const env = {
    ...result.data,
    NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET:
      result.data.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images',
  } satisfies ServerEnv;

  if (!env.ADMIN_REVALIDATE_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_REVALIDATE_TOKEN is required in production');
    }
    console.warn('ADMIN_REVALIDATE_TOKEN is not set. Admin revalidate endpoint will be disabled.');
  }

  cachedEnv = env;
  return env;
}

export type { ServerEnv };
