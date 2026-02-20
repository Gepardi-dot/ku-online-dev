import { randomUUID } from 'crypto';

import { getSupabaseErrorMeta } from '@/lib/sponsors/errors';

export type SponsorLogContext = {
  requestId: string;
  route: string;
  action: string;
  actorUserId?: string | null;
  storeId?: string | null;
  status?: string | null;
  error?: unknown;
  extra?: Record<string, unknown> | null;
};

export function createSponsorRequestId(): string {
  return randomUUID();
}

export function logSponsorInfo(context: SponsorLogContext): void {
  console.info('[sponsor]', {
    requestId: context.requestId,
    route: context.route,
    action: context.action,
    actorUserId: context.actorUserId ?? null,
    storeId: context.storeId ?? null,
    status: context.status ?? null,
    ...(context.extra ?? {}),
  });
}

export function logSponsorError(context: SponsorLogContext): void {
  const meta = context.error ? getSupabaseErrorMeta(context.error) : null;
  console.error('[sponsor]', {
    requestId: context.requestId,
    route: context.route,
    action: context.action,
    actorUserId: context.actorUserId ?? null,
    storeId: context.storeId ?? null,
    status: context.status ?? null,
    error: meta
      ? {
          code: meta.code || null,
          message: meta.message || null,
          details: meta.details || null,
          hint: meta.hint || null,
        }
      : null,
    ...(context.extra ?? {}),
  });
}
