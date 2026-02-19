'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';

import { PWA_TELEMETRY_EVENTS } from '@/components/pwa/pwa-events';

type TelemetryPrimitive = string | number | boolean | null;
type TelemetryMeta = Record<string, TelemetryPrimitive>;

type TelemetryEvent = {
  type: 'web_vital' | 'pwa_lifecycle';
  name: string;
  ts: number;
  path: string;
  value?: number;
  unit?: 'ms' | 'score' | 'count';
  rating?: 'good' | 'needs-improvement' | 'poor';
  id?: string;
  meta?: TelemetryMeta;
};

type TelemetryContext = {
  href?: string;
  ua?: string;
  displayMode: 'standalone' | 'browser' | 'unknown';
  language?: string;
  tzOffset?: number;
};

type LifecycleEventMap = Record<string, string>;

declare global {
  interface Window {
    __KU_PWA_TELEMETRY_ACTIVE__?: boolean;
  }
}

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';
const TELEMETRY_ENABLED = process.env.NEXT_PUBLIC_PWA_TELEMETRY_ENABLED !== 'false';
const TELEMETRY_ENDPOINT = '/api/pwa/telemetry';
const MAX_BATCH_SIZE = 20;
const MAX_QUEUE_SIZE = 120;
const FLUSH_DELAY_MS = 8_000;
const RETRY_DELAY_MS = 1_500;
const MAX_DETAIL_STRING = 160;
const MAX_VITAL_ID_LENGTH = 96;

const lifecycleEventMap: LifecycleEventMap = {
  'ku-pwa-sw-registered': 'sw_registered',
  'ku-pwa-sw-registration-failed': 'sw_registration_failed',
  'ku-pwa-installable': 'install_prompt_available',
  'ku-pwa-installed': 'app_installed',
  [PWA_TELEMETRY_EVENTS.ROLLOUT_ENABLED]: 'rollout_enabled',
  [PWA_TELEMETRY_EVENTS.ROLLOUT_DISABLED]: 'rollout_disabled',
  [PWA_TELEMETRY_EVENTS.INSTALL_PROMPT_SHOWN]: 'install_prompt_shown',
  [PWA_TELEMETRY_EVENTS.INSTALL_CTA_CLICKED]: 'install_cta_clicked',
  [PWA_TELEMETRY_EVENTS.INSTALL_GUIDE_OPENED]: 'install_guide_opened',
  [PWA_TELEMETRY_EVENTS.INSTALL_MINIMIZED]: 'install_minimized',
  [PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_CONTROL_SHOWN]: 'install_variant_control_shown',
  [PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_SPOTLIGHT_SHOWN]: 'install_variant_spotlight_shown',
  [PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_CONTROL_CTA_CLICKED]: 'install_variant_control_cta_clicked',
  [PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_SPOTLIGHT_CTA_CLICKED]: 'install_variant_spotlight_cta_clicked',
  [PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_CONTROL_ACCEPTED]: 'install_variant_control_accepted',
  [PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_SPOTLIGHT_ACCEPTED]: 'install_variant_spotlight_accepted',
  [PWA_TELEMETRY_EVENTS.INSTALL_ACCEPTED]: 'install_accepted',
  [PWA_TELEMETRY_EVENTS.INSTALL_DISMISSED]: 'install_dismissed',
  [PWA_TELEMETRY_EVENTS.PUSH_PROMPT_SHOWN]: 'push_prompt_shown',
  [PWA_TELEMETRY_EVENTS.PUSH_ENABLED]: 'push_enabled',
  [PWA_TELEMETRY_EVENTS.PUSH_DISMISSED]: 'push_dismissed',
  [PWA_TELEMETRY_EVENTS.PUSH_PERMISSION_DENIED]: 'push_permission_denied',
  [PWA_TELEMETRY_EVENTS.PUSH_ENABLE_FAILED]: 'push_enable_failed',
};

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

function roundMetricValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(3));
}

function resolvePath(pathname: string | null) {
  if (pathname && pathname.length > 0) {
    return pathname;
  }
  if (typeof window !== 'undefined' && window.location.pathname) {
    return window.location.pathname;
  }
  return '/';
}

function getDisplayMode(): TelemetryContext['displayMode'] {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  const standaloneFromMediaQuery = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const standaloneFromNavigator = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  if (standaloneFromMediaQuery || standaloneFromNavigator) {
    return 'standalone';
  }

  return 'browser';
}

function sanitizeDetail(detail: unknown): TelemetryMeta | undefined {
  if (!detail || typeof detail !== 'object') {
    return undefined;
  }

  const source = detail as Record<string, unknown>;
  const normalized: TelemetryMeta = {};

  for (const [key, rawValue] of Object.entries(source)) {
    if (!key || key.length > 48) {
      continue;
    }

    if (typeof rawValue === 'string') {
      normalized[key] = truncate(rawValue, MAX_DETAIL_STRING);
      continue;
    }

    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      normalized[key] = rawValue;
      continue;
    }

    if (typeof rawValue === 'boolean' || rawValue === null) {
      normalized[key] = rawValue;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildContext(): TelemetryContext {
  if (typeof window === 'undefined') {
    return { displayMode: 'unknown' };
  }

  return {
    href: truncate(window.location.href, 300),
    ua: truncate(navigator.userAgent, 260),
    displayMode: getDisplayMode(),
    language: truncate(navigator.language, 24),
    tzOffset: new Date().getTimezoneOffset(),
  };
}

function metricUnit(metricName: string): TelemetryEvent['unit'] {
  if (metricName === 'CLS') {
    return 'score';
  }
  return 'ms';
}

export default function PwaTelemetry() {
  const pathname = usePathname();
  const telemetryEnabled = PWA_ENABLED && TELEMETRY_ENABLED;
  const queueRef = useRef<TelemetryEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const flushInFlightRef = useRef(false);
  const enabledRef = useRef(telemetryEnabled);
  const pathRef = useRef<string>(resolvePath(pathname));
  const flushQueueRef = useRef<(preferBeacon: boolean) => Promise<void>>(async () => undefined);
  const enqueueEventRef = useRef<(event: Omit<TelemetryEvent, 'ts' | 'path'>) => void>(() => undefined);

  useEffect(() => {
    pathRef.current = resolvePath(pathname);
  }, [pathname]);

  useEffect(() => {
    enabledRef.current = telemetryEnabled;
  }, [telemetryEnabled]);

  function clearFlushTimer() {
    if (flushTimerRef.current === null || typeof window === 'undefined') {
      return;
    }
    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
  }

  function scheduleFlush(delayMs: number) {
    if (typeof window === 'undefined' || flushTimerRef.current !== null) {
      return;
    }
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushQueue(false);
    }, delayMs);
  }

  function requeueBatch(batch: TelemetryEvent[]) {
    if (batch.length === 0) {
      return;
    }
    queueRef.current = [...batch, ...queueRef.current];
    if (queueRef.current.length > MAX_QUEUE_SIZE) {
      queueRef.current = queueRef.current.slice(0, MAX_QUEUE_SIZE);
    }
  }

  async function flushQueue(preferBeacon: boolean) {
    if (!enabledRef.current || queueRef.current.length === 0 || flushInFlightRef.current || typeof window === 'undefined') {
      return;
    }

    const batch = queueRef.current.splice(0, MAX_BATCH_SIZE);
    if (batch.length === 0) {
      return;
    }

    const payload = JSON.stringify({
      events: batch,
      context: buildContext(),
    });

    if (preferBeacon && typeof navigator.sendBeacon === 'function') {
      const beaconPayload = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(TELEMETRY_ENDPOINT, beaconPayload);
      if (sent) {
        if (queueRef.current.length > 0) {
          scheduleFlush(RETRY_DELAY_MS);
        }
        return;
      }
    }

    flushInFlightRef.current = true;
    try {
      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        credentials: 'same-origin',
        keepalive: preferBeacon,
        cache: 'no-store',
      });

      if (!response.ok) {
        requeueBatch(batch);
      }
    } catch {
      requeueBatch(batch);
    } finally {
      flushInFlightRef.current = false;
      if (queueRef.current.length > 0) {
        scheduleFlush(RETRY_DELAY_MS);
      }
    }
  }

  function enqueueEvent(event: Omit<TelemetryEvent, 'ts' | 'path'>) {
    if (!enabledRef.current || typeof window === 'undefined') {
      return;
    }

    queueRef.current.push({
      ...event,
      ts: Date.now(),
      path: pathRef.current || resolvePath(pathname),
    });

    if (queueRef.current.length > MAX_QUEUE_SIZE) {
      queueRef.current = queueRef.current.slice(queueRef.current.length - MAX_QUEUE_SIZE);
    }

    if (queueRef.current.length >= MAX_BATCH_SIZE) {
      clearFlushTimer();
      void flushQueue(false);
      return;
    }

    scheduleFlush(FLUSH_DELAY_MS);
  }

  flushQueueRef.current = flushQueue;
  enqueueEventRef.current = enqueueEvent;

  useReportWebVitals((metric) => {
    if (!enabledRef.current) {
      return;
    }

    const normalizedName = metric.name.toLowerCase();
    const metricId =
      typeof metric.id === 'string' && metric.id.length > 0
        ? truncate(metric.id, MAX_VITAL_ID_LENGTH)
        : undefined;
    const rating =
      metric.rating === 'good' || metric.rating === 'needs-improvement' || metric.rating === 'poor'
        ? metric.rating
        : undefined;

    const meta: TelemetryMeta = {};
    if (typeof metric.delta === 'number' && Number.isFinite(metric.delta)) {
      meta.delta = roundMetricValue(metric.delta);
    }
    if (typeof metric.navigationType === 'string' && metric.navigationType.length > 0) {
      meta.navigationType = truncate(metric.navigationType, 24);
    }

    enqueueEventRef.current({
      type: 'web_vital',
      name: normalizedName,
      value: roundMetricValue(metric.value),
      unit: metricUnit(metric.name),
      rating,
      id: metricId,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    });
  });

  useEffect(() => {
    if (!telemetryEnabled || typeof window === 'undefined') {
      return;
    }

    if (window.__KU_PWA_TELEMETRY_ACTIVE__) {
      return;
    }
    window.__KU_PWA_TELEMETRY_ACTIVE__ = true;

    const lifecycleEvents = Object.keys(lifecycleEventMap);
    const onLifecycleEvent = (event: Event) => {
      const lifecycleName = lifecycleEventMap[event.type];
      if (!lifecycleName) {
        return;
      }

      const detail = event instanceof CustomEvent ? sanitizeDetail(event.detail) : undefined;
      enqueueEventRef.current({
        type: 'pwa_lifecycle',
        name: lifecycleName,
        value: 1,
        unit: 'count',
        meta: detail,
      });
    };

    for (const eventName of lifecycleEvents) {
      window.addEventListener(eventName, onLifecycleEvent as EventListener);
    }

    const flushOnHidden = () => {
      if (document.visibilityState === 'hidden') {
        clearFlushTimer();
        void flushQueueRef.current(true);
      }
    };

    const flushOnUnload = () => {
      clearFlushTimer();
      void flushQueueRef.current(true);
    };

    document.addEventListener('visibilitychange', flushOnHidden);
    window.addEventListener('pagehide', flushOnUnload);
    window.addEventListener('beforeunload', flushOnUnload);

    return () => {
      for (const eventName of lifecycleEvents) {
        window.removeEventListener(eventName, onLifecycleEvent as EventListener);
      }
      document.removeEventListener('visibilitychange', flushOnHidden);
      window.removeEventListener('pagehide', flushOnUnload);
      window.removeEventListener('beforeunload', flushOnUnload);
      clearFlushTimer();
      void flushQueueRef.current(true);
      window.__KU_PWA_TELEMETRY_ACTIVE__ = false;
    };
  }, [telemetryEnabled]);

  return null;
}
