#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const loadedFromFiles = new Set();

function loadEnvFile(relativePath) {
  const absPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absPath)) return;

  const raw = fs.readFileSync(absPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const [, key, rest] = match;
    let value = rest.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined || loadedFromFiles.has(key)) {
      process.env[key] = value;
      loadedFromFiles.add(key);
    }
  }
}

if (process.env.NODE_ENV !== 'production') {
  loadEnvFile('.env');
  loadEnvFile('.env.local');
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function boundedIntegerFromEnv(fallback, min, max) {
  return z.preprocess((value) => {
    const normalized = normalizeOptionalString(value);
    if (!normalized) return fallback;

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return fallback;

    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }, z.number().int().min(min).max(max));
}

const booleanTrueDefaultFromEnv = z
  .enum(['true', 'false'])
  .optional()
  .default('true')
  .transform((value) => value === 'true');

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
  NEXT_PUBLIC_PWA_ROLLOUT_PERCENT: boundedIntegerFromEnv(100, 0, 100),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const serverSchema = baseSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  ADMIN_REVALIDATE_TOKEN: z.string().min(1, 'ADMIN_REVALIDATE_TOKEN is required').optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  VONAGE_API_KEY: z.string().min(1).optional(),
  VONAGE_API_SECRET: z.string().min(1).optional(),
  VONAGE_APPLICATION_ID: z.string().min(1).optional(),
  VONAGE_PRIVATE_KEY64: z.string().min(1).optional(),
  VONAGE_VIRTUAL_NUMBER: z.string().min(1).optional(),
  PWA_TELEMETRY_DURABLE_ENABLED: booleanTrueDefaultFromEnv,
  PWA_TELEMETRY_SUMMARY_MAX_ROWS: boundedIntegerFromEnv(15000, 1000, 50000),
  PWA_TELEMETRY_RETENTION_DAYS: boundedIntegerFromEnv(14, 1, 90),
  PWA_SLO_ALERT_WEBHOOK_URL: optionalUrlFromEnv,
  PWA_SLO_ALERT_SECRET: optionalSecretFromEnv,
  PWA_SLO_ALERT_COOLDOWN_MINUTES: boundedIntegerFromEnv(30, 1, 24 * 60),
  PWA_SLO_ALERT_TIMEOUT_MS: boundedIntegerFromEnv(8000, 1000, 30000),
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
