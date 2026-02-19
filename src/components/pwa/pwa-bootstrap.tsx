'use client';

import { useEffect } from 'react';
import { PWA_TELEMETRY_EVENTS, dispatchPwaTelemetryEvent } from '@/components/pwa/pwa-events';
import { evaluatePwaRollout } from '@/lib/pwa/rollout';

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

declare global {
  interface Window {
    __KU_PWA_BOOTSTRAPPED__?: boolean;
    __KU_PWA_INSTALL_PROMPT__?: BeforeInstallPromptEvent;
  }
}

interface BeforeInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
}

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

function isStandaloneMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const fromMediaQuery = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const fromNavigator = (navigator as NavigatorWithStandalone).standalone ?? false;
  return fromMediaQuery || fromNavigator;
}

function updateDisplayModeAttribute() {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.displayMode = isStandaloneMode() ? 'standalone' : 'browser';
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof (event as BeforeInstallPromptEvent).prompt === 'function';
}

function canRegisterServiceWorker() {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator;
}

export default function PwaBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const rollout = evaluatePwaRollout(PWA_ENABLED);
    document.documentElement.dataset.pwaRollout = rollout.enabled ? 'enabled' : 'disabled';
    document.documentElement.dataset.pwaRolloutPercent = String(rollout.percent);
    if (rollout.bucket === null) {
      delete document.documentElement.dataset.pwaRolloutBucket;
    } else {
      document.documentElement.dataset.pwaRolloutBucket = String(rollout.bucket);
    }

    if (PWA_ENABLED) {
      dispatchPwaTelemetryEvent(
        rollout.enabled
          ? PWA_TELEMETRY_EVENTS.ROLLOUT_ENABLED
          : PWA_TELEMETRY_EVENTS.ROLLOUT_DISABLED,
        {
          percent: rollout.percent,
          bucket: rollout.bucket,
          reason: rollout.reason,
        },
      );
    }

    if (!rollout.enabled) {
      return;
    }

    if (window.__KU_PWA_BOOTSTRAPPED__) {
      return;
    }
    window.__KU_PWA_BOOTSTRAPPED__ = true;

    updateDisplayModeAttribute();

    const mediaQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
    const handleMediaQueryChange = () => updateDisplayModeAttribute();

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleMediaQueryChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleMediaQueryChange);
      }
    }

    const onBeforeInstallPrompt = (event: Event) => {
      if (!isBeforeInstallPromptEvent(event)) {
        return;
      }
      event.preventDefault();
      window.__KU_PWA_INSTALL_PROMPT__ = event;
      window.dispatchEvent(new CustomEvent('ku-pwa-installable'));
    };

    const onAppInstalled = () => {
      window.__KU_PWA_INSTALL_PROMPT__ = undefined;
      updateDisplayModeAttribute();
      window.dispatchEvent(new CustomEvent('ku-pwa-installed'));
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    const registerServiceWorker = async () => {
      if (!canRegisterServiceWorker()) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        window.dispatchEvent(
          new CustomEvent('ku-pwa-sw-registered', {
            detail: { scope: registration.scope },
          }),
        );
      } catch (error) {
        window.dispatchEvent(new CustomEvent('ku-pwa-sw-registration-failed'));
        if (process.env.NODE_ENV !== 'production') {
          console.warn('PWA service worker registration failed.', error);
        }
      }
    };

    void registerServiceWorker();

    return () => {
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleMediaQueryChange);
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(handleMediaQueryChange);
        }
      }
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  return null;
}
