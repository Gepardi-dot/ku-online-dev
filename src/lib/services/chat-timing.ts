'use client';

export type ChatTimingMeta = Record<string, unknown>;

const TIMING_STORAGE_KEY = 'chat:timings';
let cachedEnabled: boolean | null = null;

function readEnabled(): boolean {
  if (cachedEnabled !== null) {
    return cachedEnabled;
  }
  if (typeof window === 'undefined') {
    cachedEnabled = false;
    return cachedEnabled;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('chatTiming') === '1') {
      cachedEnabled = true;
      return cachedEnabled;
    }
    cachedEnabled = window.localStorage?.getItem(TIMING_STORAGE_KEY) === '1';
    return cachedEnabled;
  } catch {
    cachedEnabled = false;
    return cachedEnabled;
  }
}

export function isChatTimingEnabled(): boolean {
  return readEnabled();
}

export function chatTimingNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function logChatTiming(label: string, ms: number, meta?: ChatTimingMeta): void {
  if (!readEnabled()) return;
  const payload: Record<string, unknown> = { ms: Math.round(ms) };
  if (meta) {
    Object.assign(payload, meta);
  }
  console.info(`[chat-timing] ${label}`, payload);
}
