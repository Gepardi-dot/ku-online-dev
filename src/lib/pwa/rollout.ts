type PwaRolloutReason =
  | 'base_disabled'
  | 'percent_zero'
  | 'percent_hundred'
  | 'override_on'
  | 'override_off'
  | 'bucket_included'
  | 'bucket_excluded';

export type PwaRolloutDecision = {
  enabled: boolean;
  reason: PwaRolloutReason;
  percent: number;
  bucket: number | null;
};

const ROLLOUT_ID_STORAGE_KEY = 'ku_pwa_rollout_id';
const ROLLOUT_OVERRIDE_STORAGE_KEY = 'ku_pwa_rollout_override';
const ROLLOUT_OVERRIDE_QUERY_KEY = 'pwa_rollout';
const rolloutPercent = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_PWA_ROLLOUT_PERCENT ?? 100);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(100, Math.floor(raw)));
})();

function safeLocalStorageGet(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private browsing / quota / disabled storage).
  }
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function hashFnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRolloutId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const fallback = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `pwa-${fallback}`;
}

function getOrCreateRolloutId() {
  const existing = safeLocalStorageGet(ROLLOUT_ID_STORAGE_KEY);
  if (existing && existing.length > 0) {
    return existing;
  }

  const created = createRolloutId();
  safeLocalStorageSet(ROLLOUT_ID_STORAGE_KEY, created);
  return created;
}

function parseOverrideValue(value: string | null): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'on' || normalized === '1' || normalized === 'true') return true;
  if (normalized === 'off' || normalized === '0' || normalized === 'false') return false;
  if (normalized === 'reset') return null;
  return null;
}

function readOverrideFromQuery() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(ROLLOUT_OVERRIDE_QUERY_KEY);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'reset') {
    safeLocalStorageRemove(ROLLOUT_OVERRIDE_STORAGE_KEY);
    return null;
  }

  const parsed = parseOverrideValue(raw);
  if (parsed === true) {
    safeLocalStorageSet(ROLLOUT_OVERRIDE_STORAGE_KEY, 'on');
    return true;
  }
  if (parsed === false) {
    safeLocalStorageSet(ROLLOUT_OVERRIDE_STORAGE_KEY, 'off');
    return false;
  }
  return null;
}

function readOverrideFromStorage() {
  const raw = safeLocalStorageGet(ROLLOUT_OVERRIDE_STORAGE_KEY);
  return parseOverrideValue(raw);
}

function resolveOverride() {
  const fromQuery = readOverrideFromQuery();
  if (fromQuery !== null) {
    return fromQuery;
  }
  return readOverrideFromStorage();
}

export function getPwaRolloutPercent() {
  return rolloutPercent;
}

export function evaluatePwaRollout(baseEnabled: boolean): PwaRolloutDecision {
  if (!baseEnabled) {
    return {
      enabled: false,
      reason: 'base_disabled',
      percent: rolloutPercent,
      bucket: null,
    };
  }

  if (rolloutPercent <= 0) {
    return {
      enabled: false,
      reason: 'percent_zero',
      percent: rolloutPercent,
      bucket: null,
    };
  }

  const override = resolveOverride();
  if (override === true) {
    return {
      enabled: true,
      reason: 'override_on',
      percent: rolloutPercent,
      bucket: null,
    };
  }
  if (override === false) {
    return {
      enabled: false,
      reason: 'override_off',
      percent: rolloutPercent,
      bucket: null,
    };
  }

  if (rolloutPercent >= 100) {
    return {
      enabled: true,
      reason: 'percent_hundred',
      percent: rolloutPercent,
      bucket: null,
    };
  }

  const rolloutId = getOrCreateRolloutId();
  const bucket = hashFnv1a32(rolloutId) % 100;
  const enabled = bucket < rolloutPercent;

  return {
    enabled,
    reason: enabled ? 'bucket_included' : 'bucket_excluded',
    percent: rolloutPercent,
    bucket,
  };
}
