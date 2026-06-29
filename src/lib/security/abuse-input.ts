export type AbuseTargetType = 'product' | 'user' | 'message';
export type AbuseReportStatus = 'open' | 'auto-flagged' | 'resolved' | 'dismissed';

export type AbuseInputResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type NormalizedAbuseReportInput = {
  targetType: AbuseTargetType;
  targetId: string;
  reason: string;
  details: string | null;
};

export type NormalizedBlockUserInput = {
  blockedUserId: string;
  reason: string | null;
};

export type NormalizedManageReportInput = {
  id: string;
  status?: AbuseReportStatus;
  reactivateProduct: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET_TYPES = new Set<AbuseTargetType>(['product', 'user', 'message']);
const REPORT_STATUSES = new Set<AbuseReportStatus>(['open', 'auto-flagged', 'resolved', 'dismissed']);

export const ABUSE_REPORT_REASON_MAX_LENGTH = 160;
export const ABUSE_REPORT_DETAILS_MAX_LENGTH = 2_000;
export const BLOCK_REASON_MAX_LENGTH = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

function normalizeRequiredText(value: unknown, fieldName: string, maxLength: number): AbuseInputResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} is required.` };
  }

  const normalized = value.trim();
  if (!normalized) {
    return { ok: false, error: `${fieldName} is required.` };
  }

  if (normalized.length > maxLength) {
    return { ok: false, error: `${fieldName} is too long.` };
  }

  return { ok: true, value: normalized };
}

function normalizeOptionalText(value: unknown, fieldName: string, maxLength: number): AbuseInputResult<string | null> {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldName} must be text.` };
  }

  const normalized = value.trim();
  if (!normalized) {
    return { ok: true, value: null };
  }

  if (normalized.length > maxLength) {
    return { ok: false, error: `${fieldName} is too long.` };
  }

  return { ok: true, value: normalized };
}

export function parseAbuseReportInput(input: unknown): AbuseInputResult<NormalizedAbuseReportInput> {
  if (!isRecord(input)) {
    return { ok: false, error: 'Invalid report payload.' };
  }

  const targetType = input.targetType;
  if (typeof targetType !== 'string' || !TARGET_TYPES.has(targetType as AbuseTargetType)) {
    return { ok: false, error: 'Unsupported targetType.' };
  }
  const normalizedTargetType = targetType as AbuseTargetType;

  const targetId = input.targetId;
  if (!isUuid(targetId)) {
    return { ok: false, error: 'Invalid targetId.' };
  }

  const reason = normalizeRequiredText(input.reason, 'reason', ABUSE_REPORT_REASON_MAX_LENGTH);
  if (!reason.ok) {
    return reason;
  }

  const details = normalizeOptionalText(input.details, 'details', ABUSE_REPORT_DETAILS_MAX_LENGTH);
  if (!details.ok) {
    return details;
  }

  return {
    ok: true,
    value: {
      targetType: normalizedTargetType,
      targetId: targetId.trim(),
      reason: reason.value,
      details: details.value,
    },
  };
}

export function parseBlockUserInput(input: unknown): AbuseInputResult<NormalizedBlockUserInput> {
  if (!isRecord(input)) {
    return { ok: false, error: 'Invalid block payload.' };
  }

  const blockedUserId = input.blockedUserId;
  if (!isUuid(blockedUserId)) {
    return { ok: false, error: 'Invalid blockedUserId.' };
  }

  const reason = normalizeOptionalText(input.reason, 'reason', BLOCK_REASON_MAX_LENGTH);
  if (!reason.ok) {
    return reason;
  }

  return {
    ok: true,
    value: {
      blockedUserId: blockedUserId.trim(),
      reason: reason.value,
    },
  };
}

export function parseManageReportInput(input: unknown): AbuseInputResult<NormalizedManageReportInput> {
  if (!isRecord(input)) {
    return { ok: false, error: 'Invalid report management payload.' };
  }

  const id = input.id;
  if (!isUuid(id)) {
    return { ok: false, error: 'Invalid report id.' };
  }

  const status = input.status;
  if (status !== undefined && (typeof status !== 'string' || !REPORT_STATUSES.has(status as AbuseReportStatus))) {
    return { ok: false, error: 'Invalid status.' };
  }

  return {
    ok: true,
    value: {
      id: id.trim(),
      status: status as AbuseReportStatus | undefined,
      reactivateProduct: input.reactivateProduct === true,
    },
  };
}
