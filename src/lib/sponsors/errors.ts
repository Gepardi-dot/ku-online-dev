export type SponsorApiErrorCode =
  | 'SPONSOR_FORBIDDEN_ORIGIN'
  | 'SPONSOR_RATE_LIMITED'
  | 'SPONSOR_NOT_AUTHORIZED'
  | 'SPONSOR_INVALID_PAYLOAD'
  | 'SPONSOR_SLUG_CONFLICT'
  | 'SPONSOR_OWNER_NOT_FOUND'
  | 'SPONSOR_STORE_NOT_FOUND'
  | 'SPONSOR_OWNER_REQUIRED_FOR_APPROVAL'
  | 'SPONSOR_INVALID_STATUS_TRANSITION'
  | 'SPONSOR_SCHEMA_MISMATCH'
  | 'SPONSOR_DB_READ_FAILED'
  | 'SPONSOR_DB_WRITE_FAILED'
  | 'SPONSOR_AUDIT_LOG_FAILED';

export type SupabaseErrorMeta = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

function getText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function getSupabaseErrorMeta(error: unknown): SupabaseErrorMeta {
  const raw = (error ?? {}) as Record<string, unknown>;
  return {
    code: getText(raw.code),
    message: getText(raw.message).toLowerCase(),
    details: getText(raw.details).toLowerCase(),
    hint: getText(raw.hint).toLowerCase(),
  };
}

export function isSchemaMismatchMeta(meta: SupabaseErrorMeta): boolean {
  const message = meta.message;
  const details = meta.details;
  const hint = meta.hint;

  return (
    meta.code === '42P01' ||
    meta.code === '42703' ||
    meta.code === 'PGRST205' ||
    meta.code === 'PGRST204' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('column') && message.includes('does not exist')) ||
    (message.includes('could not find') && message.includes('table') && message.includes('schema cache')) ||
    (message.includes('could not find') && message.includes('column') && message.includes('schema cache')) ||
    (details.includes('schema cache') && details.includes('table')) ||
    (hint.includes('schema cache') && hint.includes('column'))
  );
}
