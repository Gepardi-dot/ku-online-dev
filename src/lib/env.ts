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
