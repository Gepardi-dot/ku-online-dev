'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { PWA_TELEMETRY_EVENTS, dispatchPwaTelemetryEvent } from '@/components/pwa/pwa-events';
import { evaluatePwaRollout } from '@/lib/pwa/rollout';

const PUSH_ENABLED = process.env.NEXT_PUBLIC_PWA_PUSH_ENABLED === 'true';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY ?? '';
const BASE_PUSH_ENABLED = PUSH_ENABLED && VAPID_PUBLIC_KEY.length > 0;
const DISMISS_STORAGE_KEY = 'ku_pwa_push_dismiss_until';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type PushSubscriptionJson = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function supportsWebPush() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function getDismissUntil() {
  const value = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setDismissUntil(timestamp: number) {
  window.localStorage.setItem(DISMISS_STORAGE_KEY, String(timestamp));
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function toSubscriptionJson(subscription: PushSubscription): PushSubscriptionJson {
  const serialized = subscription.toJSON();
  const keys = serialized.keys ?? {};
  return {
    endpoint: serialized.endpoint ?? '',
    expirationTime: serialized.expirationTime ?? null,
    keys: {
      p256dh: keys.p256dh ?? '',
      auth: keys.auth ?? '',
    },
  };
}

async function postSubscription(subscription: PushSubscriptionJson) {
  const response = await fetch('/api/pwa/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });
  return response.ok;
}

async function deleteSubscription(endpoint: string) {
  const response = await fetch('/api/pwa/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  return response.ok;
}

export default function PwaPushBanner() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setEnabled(evaluatePwaRollout(BASE_PUSH_ENABLED).enabled);
  }, []);

  const dismiss = useCallback((reason: 'not_now' | 'permission_denied' | 'error' = 'not_now') => {
    dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.PUSH_DISMISSED, { reason });
    setDismissUntil(Date.now() + DISMISS_DURATION_MS);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!enabled || !supportsWebPush()) {
      return;
    }

    let disposed = false;

    const initialize = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (disposed || !user) {
        return;
      }

      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch {
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      if (disposed) return;

      if (existing) {
        if (Notification.permission === 'denied') {
          await existing.unsubscribe().catch(() => undefined);
          await deleteSubscription(existing.endpoint);
          return;
        }

        const subscriptionJson = toSubscriptionJson(existing);
        if (subscriptionJson.endpoint) {
          await postSubscription(subscriptionJson);
        }
        return;
      }

      if (Notification.permission === 'denied') {
        return;
      }

      if (Date.now() < getDismissUntil()) {
        return;
      }

      setVisible((currentValue) => {
        if (!currentValue) {
          dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.PUSH_PROMPT_SHOWN);
        }
        return true;
      });
    };

    void initialize();

    return () => {
      disposed = true;
    };
  }, [enabled]);

  const enablePush = useCallback(async () => {
    if (!enabled || !supportsWebPush()) {
      return;
    }
    setBusy(true);

    try {
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();

      if (permission !== 'granted') {
        dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.PUSH_PERMISSION_DENIED, { permission });
        dismiss('permission_denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        }));

      const payload = toSubscriptionJson(subscription);
      if (!payload.endpoint || !payload.keys.p256dh || !payload.keys.auth) {
        throw new Error('Incomplete push subscription payload');
      }

      const saved = await postSubscription(payload);
      if (!saved) {
        throw new Error('Failed to persist push subscription');
      }

      dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.PUSH_ENABLED, {
        source: existing ? 'existing' : 'new',
      });
      setDismissUntil(0);
      setVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 140) : 'unknown_error';
      dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.PUSH_ENABLE_FAILED, { message });
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to enable push notifications.', error);
      }
      dismiss('error');
    } finally {
      setBusy(false);
    }
  }, [dismiss, enabled]);

  if (!enabled || !visible) {
    return null;
  }

  return (
    <aside
      className="fixed bottom-[calc(var(--mobile-nav-offset)+5.75rem)] left-1/2 z-[59] w-[min(34rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border border-orange-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm md:bottom-20"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Enable push notifications</p>
          <p className="text-xs text-muted-foreground">Get real-time alerts for messages, updates, and account activity.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-orange-200 px-3 py-1 text-xs font-semibold text-foreground hover:bg-orange-50"
          onClick={() => dismiss('not_now')}
        >
          Not now
        </button>
        <button
          type="button"
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          onClick={() => void enablePush()}
          disabled={busy}
        >
          {busy ? 'Saving...' : 'Enable'}
        </button>
      </div>
    </aside>
  );
}
