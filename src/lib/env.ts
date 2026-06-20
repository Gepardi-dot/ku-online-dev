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

const optionalEmailFromEnv = z.preprocess(
  (value) => normalizeOptionalString(value),
  z.string().email().optional(),
);

function optionalStringMinFromEnv(min: number) {
  return z.preprocess(
    (value) => normalizeOptionalString(value),
    z.string().min(min).optional(),
  );
}

const baseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: z
    .string()
    .min(1)
    .default('product-images'),
  NEXT_PUBLIC_SITE_URL: optionalUrlFromEnv,
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
  NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY: optionalSecretFromEnv,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrlFromEnv,
  NEXT_PUBLIC_PARTNERSHIPS_EMAIL: optionalEmailFromEnv,
  NEXT_PUBLIC_PARTNERSHIPS_WHATSAPP: optionalStringMinFromEnv(3),
});

const serverSchema = baseSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  ADMIN_REVALIDATE_TOKEN: optionalSecretFromEnv,
  SENTRY_DSN: optionalUrlFromEnv,
  SENTRY_ENVIRONMENT: optionalSecretFromEnv,
  ALGOLIA_APP_ID: optionalSecretFromEnv,
  ALGOLIA_ADMIN_API_KEY: optionalSecretFromEnv,
  ALGOLIA_SEARCH_API_KEY: optionalSecretFromEnv,
  ALGOLIA_INDEX_NAME: optionalSecretFromEnv,
  RESEND_API_KEY: optionalSecretFromEnv,
  VONAGE_API_KEY: optionalSecretFromEnv,
  VONAGE_API_SECRET: optionalSecretFromEnv,
  VONAGE_APPLICATION_ID: optionalSecretFromEnv,
  VONAGE_PRIVATE_KEY64: optionalSecretFromEnv,
  VONAGE_VIRTUAL_NUMBER: optionalSecretFromEnv,
  VONAGE_SMS_SENDER_ID: optionalSecretFromEnv,
  VONAGE_SMS_TEMPLATE: optionalSecretFromEnv,
  SUPABASE_SMS_HOOK_SECRET: optionalSecretFromEnv,
  PARTNERSHIPS_NOTIFY_EMAIL: optionalEmailFromEnv,
  PARTNERSHIPS_FROM_EMAIL: optionalEmailFromEnv,
  PWA_VAPID_PRIVATE_KEY: optionalSecretFromEnv,
  PWA_TELEMETRY_DURABLE_ENABLED: booleanTrueDefaultFromEnv,
  PWA_TELEMETRY_SUMMARY_MAX_ROWS: boundedIntegerFromEnv(15_000, 1_000, 50_000),
  PWA_TELEMETRY_RETENTION_DAYS: boundedIntegerFromEnv(14, 1, 90),
  PWA_SLO_ALERT_WEBHOOK_URL: optionalUrlFromEnv,
  PWA_SLO_ALERT_SECRET: optionalSecretFromEnv,
  PWA_SLO_ALERT_COOLDOWN_MINUTES: boundedIntegerFromEnv(30, 1, 24 * 60),
  PWA_SLO_ALERT_TIMEOUT_MS: boundedIntegerFromEnv(8_000, 1_000, 30_000),
  UPSTASH_REDIS_REST_URL: optionalUrlFromEnv,
  UPSTASH_REDIS_REST_TOKEN: optionalSecretFromEnv,
  KV_REST_API_URL: optionalUrlFromEnv,
  KV_REST_API_TOKEN: optionalSecretFromEnv,
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
