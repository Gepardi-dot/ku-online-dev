'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PWA_TELEMETRY_EVENTS, dispatchPwaTelemetryEvent } from '@/components/pwa/pwa-events';
import { evaluatePwaRollout } from '@/lib/pwa/rollout';

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';
const INSTALL_UI_ENABLED = process.env.NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED !== 'false';
const BASE_INSTALL_ENABLED = PWA_ENABLED && INSTALL_UI_ENABLED;

const IMPRESSION_STORAGE_KEY = 'ku_pwa_install_impressions_v1';
const SESSION_PAGE_VIEWS_KEY = 'ku_pwa_install_session_page_views';
const SESSION_MINIMIZED_KEY = 'ku_pwa_install_session_minimized';
const SESSION_DISMISSED_KEY = 'ku_pwa_install_session_dismissed';
const INSTALLED_STORAGE_KEY = 'ku_pwa_install_installed_v1';
const INSTALL_VARIANT_STORAGE_KEY = 'ku_pwa_install_variant_v1';
const INSTALL_VARIANT_QUERY_KEY = 'pwa_install_variant';
const INSTALL_DEBUG_RESET_QUERY_KEY = 'pwa_install_debug_reset';
const ROLLOUT_ID_STORAGE_KEY = 'ku_pwa_rollout_id';

const IMPRESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMPRESSIONS_PER_WINDOW = 6;
const ENGAGEMENT_DWELL_MS = 12_000;
const ENGAGEMENT_SCROLL_Y = 260;
const ENGAGEMENT_PAGE_VIEWS = 2;
const ROUTE_BLOCK_PREFIXES = ['/admin', '/auth'];
const INSTALL_VARIANTS = ['control', 'spotlight'] as const;

type InstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallPromptChoice>;
};

type PwaInstallWindow = Window & {
  __KU_PWA_INSTALL_PROMPT__?: InstallPromptEvent;
};

type InstallMode = 'prompt' | 'ios_manual';
type IosBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other';
type DismissReason = 'close_button' | 'prompt_dismissed';
type InstallVariant = (typeof INSTALL_VARIANTS)[number];
type InstallVariantSource = 'query' | 'storage' | 'deterministic';

function getLocalStorageSafe() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorageSafe() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readNumber(storage: Storage | null, key: string, fallback = 0) {
  if (!storage) return fallback;
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function writeNumber(storage: Storage | null, key: string, value: number) {
  if (!storage) return;
  storage.setItem(key, String(value));
}

function isStandaloneMode() {
  const fromMediaQuery = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const fromNavigator =
    'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return fromMediaQuery || fromNavigator;
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  const maxTouchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  const classicIos = /iphone|ipad|ipod/i.test(ua);
  const modernIpad = platform === 'MacIntel' && maxTouchPoints > 1;
  return classicIos || modernIpad;
}

function detectIosBrowser(): IosBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent ?? '';
  if (!/iphone|ipad|ipod|mac/i.test(ua)) return 'other';
  if (/edgios/i.test(ua)) return 'edge';
  if (/fxios/i.test(ua)) return 'firefox';
  if (/crios/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)) return 'safari';
  return 'other';
}

function normalizeInstallVariant(value: string | null | undefined): InstallVariant | null {
  if (value === 'control' || value === 'spotlight') {
    return value;
  }
  return null;
}

function hashFnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function resolveInstallVariant(): { variant: InstallVariant; source: InstallVariantSource } {
  const storage = getLocalStorageSafe();

  const queryVariant =
    typeof window !== 'undefined'
      ? normalizeInstallVariant(new URLSearchParams(window.location.search).get(INSTALL_VARIANT_QUERY_KEY))
      : null;
  if (queryVariant) {
    storage?.setItem(INSTALL_VARIANT_STORAGE_KEY, queryVariant);
    return { variant: queryVariant, source: 'query' };
  }

  const storedVariant = normalizeInstallVariant(storage?.getItem(INSTALL_VARIANT_STORAGE_KEY));
  if (storedVariant) {
    return { variant: storedVariant, source: 'storage' };
  }

  const rolloutId =
    storage?.getItem(ROLLOUT_ID_STORAGE_KEY) ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : 'fallback-ua');
  const bucket = hashFnv1a32(rolloutId) % INSTALL_VARIANTS.length;
  const variant = INSTALL_VARIANTS[bucket];
  storage?.setItem(INSTALL_VARIANT_STORAGE_KEY, variant);
  return { variant, source: 'deterministic' };
}

function resetInstallPromptState() {
  const localStorage = getLocalStorageSafe();
  const sessionStorage = getSessionStorageSafe();

  localStorage?.removeItem(IMPRESSION_STORAGE_KEY);
  localStorage?.removeItem(INSTALLED_STORAGE_KEY);
  sessionStorage?.removeItem(SESSION_PAGE_VIEWS_KEY);
  sessionStorage?.removeItem(SESSION_MINIMIZED_KEY);
  sessionStorage?.removeItem(SESSION_DISMISSED_KEY);
}

function consumeInstallDebugResetQuery() {
  if (typeof window === 'undefined') {
    return false;
  }

  const url = new URL(window.location.href);
  const resetValue = url.searchParams.get(INSTALL_DEBUG_RESET_QUERY_KEY);
  if (!resetValue) {
    return false;
  }

  const normalized = resetValue.trim().toLowerCase();
  if (!['1', 'true', 'yes', 'on'].includes(normalized)) {
    return false;
  }

  resetInstallPromptState();

  url.searchParams.delete(INSTALL_DEBUG_RESET_QUERY_KEY);
  window.history.replaceState(window.history.state, '', url.toString());

  return true;
}

function readImpressionTimestamps(now = Date.now()) {
  const storage = getLocalStorageSafe();
  if (!storage) return [] as number[];

  const raw = storage.getItem(IMPRESSION_STORAGE_KEY);
  if (!raw) return [] as number[];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [] as number[];
    return parsed
      .map((item) => Number(item))
      .filter((ts) => Number.isFinite(ts) && ts > now - IMPRESSION_WINDOW_MS && ts <= now + 60_000)
      .sort((a, b) => a - b);
  } catch {
    return [] as number[];
  }
}

function writeImpressionTimestamps(timestamps: number[]) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  storage.setItem(IMPRESSION_STORAGE_KEY, JSON.stringify(timestamps.slice(-MAX_IMPRESSIONS_PER_WINDOW * 2)));
}

function hasReachedImpressionCap() {
  return readImpressionTimestamps().length >= MAX_IMPRESSIONS_PER_WINDOW;
}

function recordImpression() {
  const now = Date.now();
  const next = [...readImpressionTimestamps(now), now];
  writeImpressionTimestamps(next);
}

function incrementSessionPageViews() {
  const storage = getSessionStorageSafe();
  const next = readNumber(storage, SESSION_PAGE_VIEWS_KEY, 0) + 1;
  writeNumber(storage, SESSION_PAGE_VIEWS_KEY, next);
  return next;
}

function readSessionMinimized() {
  return readNumber(getSessionStorageSafe(), SESSION_MINIMIZED_KEY, 0) === 1;
}

function writeSessionMinimized(value: boolean) {
  writeNumber(getSessionStorageSafe(), SESSION_MINIMIZED_KEY, value ? 1 : 0);
}

function readSessionDismissed() {
  return readNumber(getSessionStorageSafe(), SESSION_DISMISSED_KEY, 0) === 1;
}

function writeSessionDismissed(value: boolean) {
  writeNumber(getSessionStorageSafe(), SESSION_DISMISSED_KEY, value ? 1 : 0);
}

function isInstallConfirmed() {
  return readNumber(getLocalStorageSafe(), INSTALLED_STORAGE_KEY, 0) === 1;
}

function setInstallConfirmed(value: boolean) {
  writeNumber(getLocalStorageSafe(), INSTALLED_STORAGE_KEY, value ? 1 : 0);
}

function normalizePathname(pathname: string | null) {
  if (!pathname || !pathname.trim()) return '/';
  return pathname.trim();
}

function isRouteEligible(pathname: string | null) {
  const normalized = normalizePathname(pathname);
  return !ROUTE_BLOCK_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export default function PwaInstallBanner() {
  const pathname = usePathname();
  const routeEligible = useMemo(() => isRouteEligible(pathname), [pathname]);

  const [enabled, setEnabled] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode | null>(null);
  const [iosDevice, setIosDevice] = useState(false);
  const [iosBrowser, setIosBrowser] = useState<IosBrowser>('other');
  const [installVariant, setInstallVariant] = useState<InstallVariant>('control');
  const [installVariantSource, setInstallVariantSource] = useState<InstallVariantSource>('deterministic');
  const [installing, setInstalling] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const shownTelemetryRef = useRef(false);
  const impressionRecordedRef = useRef(false);
  const installVariantRef = useRef<InstallVariant>('control');
  const installVariantSourceRef = useRef<InstallVariantSource>('deterministic');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    consumeInstallDebugResetQuery();
    if (isStandaloneMode()) {
      setInstallConfirmed(true);
    }
    setEnabled(evaluatePwaRollout(BASE_INSTALL_ENABLED).enabled);
    setIosDevice(isIosDevice());
    setIosBrowser(detectIosBrowser());
    const resolvedVariant = resolveInstallVariant();
    setInstallVariant(resolvedVariant.variant);
    setInstallVariantSource(resolvedVariant.source);
    installVariantRef.current = resolvedVariant.variant;
    installVariantSourceRef.current = resolvedVariant.source;
    setMinimized(readSessionMinimized());
  }, []);

  useEffect(() => {
    installVariantRef.current = installVariant;
    installVariantSourceRef.current = installVariantSource;
  }, [installVariant, installVariantSource]);

  const dispatchVariantLifecycleEvent = useCallback((action: 'shown' | 'cta_clicked' | 'accepted') => {
    const variant = installVariantRef.current;
    if (action === 'shown') {
      dispatchPwaTelemetryEvent(
        variant === 'control'
          ? PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_CONTROL_SHOWN
          : PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_SPOTLIGHT_SHOWN,
      );
      return;
    }

    if (action === 'cta_clicked') {
      dispatchPwaTelemetryEvent(
        variant === 'control'
          ? PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_CONTROL_CTA_CLICKED
          : PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_SPOTLIGHT_CTA_CLICKED,
      );
      return;
    }

    dispatchPwaTelemetryEvent(
      variant === 'control'
        ? PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_CONTROL_ACCEPTED
        : PWA_TELEMETRY_EVENTS.INSTALL_VARIANT_SPOTLIGHT_ACCEPTED,
    );
  }, []);

  useEffect(() => {
    if (!enabled || !routeEligible || typeof window === 'undefined') return;
    const pageViews = incrementSessionPageViews();
    if (pageViews >= ENGAGEMENT_PAGE_VIEWS) {
      setEngaged(true);
      return;
    }
    if (window.scrollY >= ENGAGEMENT_SCROLL_Y) {
      setEngaged(true);
      return;
    }

    let active = true;
    const onScroll = () => {
      if (!active) return;
      if (window.scrollY >= ENGAGEMENT_SCROLL_Y) {
        setEngaged(true);
      }
    };

    const timer = window.setTimeout(() => {
      if (active) setEngaged(true);
    }, ENGAGEMENT_DWELL_MS);

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled, routeEligible, pathname]);

  const hideBanner = useCallback(() => {
    setInstallMode(null);
    setShowIosGuide(false);
    setMinimized(false);
    writeSessionMinimized(false);
    shownTelemetryRef.current = false;
    impressionRecordedRef.current = false;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onDebugReset = () => {
      resetInstallPromptState();
      hideBanner();
      setMinimized(false);
      setInstalling(false);
      setShowIosGuide(false);
      window.dispatchEvent(new CustomEvent('ku-pwa-install-debug-reset-complete'));
    };

    window.addEventListener('ku-pwa-install-debug-reset', onDebugReset);
    return () => {
      window.removeEventListener('ku-pwa-install-debug-reset', onDebugReset);
    };
  }, [hideBanner]);

  const dismissForSession = useCallback((reason: DismissReason) => {
    const mode = installMode ?? 'unknown';
    dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_DISMISSED, {
      reason,
      mode,
      variant: installVariantRef.current,
      variantSource: installVariantSourceRef.current,
    });
    writeSessionDismissed(true);
    hideBanner();
  }, [hideBanner, installMode]);

  const canShowInstallBanner = useCallback(() => {
    if (!enabled || !engaged || !routeEligible) return false;
    if (isStandaloneMode()) {
      setInstallConfirmed(true);
      return false;
    }
    if (isInstallConfirmed()) return false;
    if (readSessionDismissed()) return false;
    if (hasReachedImpressionCap()) return false;
    return true;
  }, [enabled, engaged, routeEligible]);

  const revealBanner = useCallback((mode: InstallMode) => {
    if (!canShowInstallBanner()) return;

    if (minimized) {
      setInstallMode((current) => current ?? mode);
      return;
    }

    setInstallMode((currentMode) => {
      const nextMode = currentMode === 'prompt' ? 'prompt' : mode;
      if (!currentMode) {
        if (!impressionRecordedRef.current) {
          recordImpression();
          impressionRecordedRef.current = true;
        }
        if (!shownTelemetryRef.current) {
          dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_PROMPT_SHOWN, {
            mode: nextMode,
            path: normalizePathname(pathname),
            variant: installVariantRef.current,
            variantSource: installVariantSourceRef.current,
          });
          dispatchVariantLifecycleEvent('shown');
          shownTelemetryRef.current = true;
        }
      }
      return nextMode;
    });
  }, [canShowInstallBanner, dispatchVariantLifecycleEvent, minimized, pathname]);

  useEffect(() => {
    if (!routeEligible) {
      hideBanner();
    }
  }, [routeEligible, hideBanner]);

  useEffect(() => {
    if (!enabled || !engaged || !routeEligible || typeof window === 'undefined') return;

    const pwaWindow = window as PwaInstallWindow;

    const maybeShowIosManualBanner = () => {
      if (!iosDevice || pwaWindow.__KU_PWA_INSTALL_PROMPT__) return;
      revealBanner('ios_manual');
    };

    if (pwaWindow.__KU_PWA_INSTALL_PROMPT__) {
      revealBanner('prompt');
    } else {
      maybeShowIosManualBanner();
    }

    const onInstallable = () => {
      revealBanner('prompt');
    };

    const onInstalled = () => {
      setInstallConfirmed(true);
      writeSessionDismissed(true);
      hideBanner();
    };

    const onVisibilityRefresh = () => {
      if (isStandaloneMode()) {
        hideBanner();
        return;
      }
      if (pwaWindow.__KU_PWA_INSTALL_PROMPT__) {
        revealBanner('prompt');
        return;
      }
      maybeShowIosManualBanner();
    };

    window.addEventListener('ku-pwa-installable', onInstallable as EventListener);
    window.addEventListener('ku-pwa-installed', onInstalled);
    window.addEventListener('focus', onVisibilityRefresh);
    document.addEventListener('visibilitychange', onVisibilityRefresh);

    return () => {
      window.removeEventListener('ku-pwa-installable', onInstallable as EventListener);
      window.removeEventListener('ku-pwa-installed', onInstalled);
      window.removeEventListener('focus', onVisibilityRefresh);
      document.removeEventListener('visibilitychange', onVisibilityRefresh);
    };
  }, [enabled, engaged, hideBanner, iosDevice, revealBanner, routeEligible]);

  const onInstallClick = useCallback(async (source: 'main_cta' | 'minimized_chip') => {
    if (typeof window === 'undefined') return;
    const mode = installMode ?? 'unknown';
    const variant = installVariantRef.current;
    const variantSource = installVariantSourceRef.current;
    dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_CTA_CLICKED, { source, mode, variant, variantSource });
    dispatchVariantLifecycleEvent('cta_clicked');

    if (installMode === 'ios_manual') {
      setShowIosGuide(true);
      dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_GUIDE_OPENED, {
        mode,
        source,
        variant,
        variantSource,
      });
      return;
    }

    const pwaWindow = window as PwaInstallWindow;
    const installPrompt = pwaWindow.__KU_PWA_INSTALL_PROMPT__;
    if (!installPrompt) {
      if (iosDevice) {
        setShowIosGuide(true);
        dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_GUIDE_OPENED, {
          mode,
          source: 'fallback',
          variant,
          variantSource,
        });
      }
      return;
    }

    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      pwaWindow.__KU_PWA_INSTALL_PROMPT__ = undefined;

      if (choice.outcome === 'accepted') {
        dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_ACCEPTED, {
          platform: choice.platform,
          mode,
          variant,
          variantSource,
        });
        dispatchVariantLifecycleEvent('accepted');
        setInstallConfirmed(true);
        writeSessionDismissed(true);
        hideBanner();
        return;
      }

      dismissForSession('prompt_dismissed');
    } finally {
      setInstalling(false);
    }
  }, [dismissForSession, dispatchVariantLifecycleEvent, hideBanner, installMode, iosDevice]);

  const onMinimize = useCallback(() => {
    dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_MINIMIZED, {
      mode: installMode ?? 'unknown',
      path: normalizePathname(pathname),
      variant: installVariantRef.current,
      variantSource: installVariantSourceRef.current,
    });
    setMinimized(true);
    writeSessionMinimized(true);
    setShowIosGuide(false);
  }, [installMode, pathname]);

  const onReopenFromChip = useCallback(() => {
    setMinimized(false);
    writeSessionMinimized(false);
    void onInstallClick('minimized_chip');
  }, [onInstallClick]);

  const onIosGuideDone = useCallback(() => {
    dispatchPwaTelemetryEvent(PWA_TELEMETRY_EVENTS.INSTALL_ACCEPTED, {
      platform: 'ios_manual',
      mode: installMode ?? 'ios_manual',
      variant: installVariantRef.current,
      variantSource: installVariantSourceRef.current,
    });
    dispatchVariantLifecycleEvent('accepted');
    setInstallConfirmed(true);
    writeSessionDismissed(true);
    hideBanner();
  }, [dispatchVariantLifecycleEvent, hideBanner, installMode]);

  if (!enabled || !installMode || !routeEligible) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-[calc(var(--mobile-nav-offset)+0.5rem)] right-3 z-[60] flex items-center gap-2 rounded-full border border-orange-200 bg-white/95 px-2 py-1 shadow-lg backdrop-blur-sm md:bottom-4">
        <button
          type="button"
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          onClick={onReopenFromChip}
        >
          {installVariant === 'spotlight' ? 'Install app' : 'Open app'}
        </button>
        <button
          type="button"
          aria-label="Dismiss install helper"
          className="rounded-full border border-orange-200 px-2 py-0.5 text-xs font-semibold text-foreground hover:bg-orange-50"
          onClick={() => dismissForSession('close_button')}
        >
          x
        </button>
      </div>
    );
  }

  const isSpotlightVariant = installVariant === 'spotlight';
  const title =
    installMode === 'prompt'
      ? isSpotlightVariant
        ? 'Install KU BAZAR in 1 tap'
        : 'Open KU BAZAR App'
      : 'Install KU BAZAR on iPhone';
  const description =
    installMode === 'prompt'
      ? isSpotlightVariant
        ? 'No app store needed. Install now for a faster, full-screen experience.'
        : 'Install once for faster startup, smoother browsing, and app-like full-screen usage.'
      : 'Add KU BAZAR to your home screen, then launch it like a native app.';
  const primaryLabel =
    installMode === 'prompt'
      ? installing
        ? 'Installing...'
        : isSpotlightVariant
          ? 'Install now'
          : 'Open in App'
      : 'Show install steps';
  const iosStepOne =
    iosBrowser === 'safari'
      ? '1. Tap the Share button (square with upward arrow) in Safari.'
      : '1. Open your browser menu, then tap Share.';
  const iosBrowserHint =
    iosBrowser === 'safari'
      ? null
      : 'Tip: If "Add to Home Screen" is missing, open this site in Safari and retry.';

  return (
    <aside
      className={
        isSpotlightVariant
          ? 'fixed bottom-[calc(var(--mobile-nav-offset)+0.4rem)] left-1/2 z-[60] w-[min(35rem,calc(100vw-0.75rem))] -translate-x-1/2 rounded-2xl border border-orange-300 bg-linear-to-r from-amber-50 via-orange-50 to-white p-3 shadow-[0_16px_40px_rgba(249,115,22,0.22)] backdrop-blur-sm md:bottom-4'
          : 'fixed bottom-[calc(var(--mobile-nav-offset)+0.4rem)] left-1/2 z-[60] w-[min(35rem,calc(100vw-0.75rem))] -translate-x-1/2 rounded-2xl border border-orange-200 bg-linear-to-r from-white via-orange-50/35 to-white p-3 shadow-xl backdrop-blur-sm md:bottom-4'
      }
      data-install-variant={installVariant}
      data-install-variant-source={installVariantSource}
      aria-live="polite"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-orange-200 bg-orange-50">
              <Image src="/icon-192.png" alt="" fill sizes="40px" className="object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              <p className="text-[11px] text-muted-foreground">Secure, installable, and optimized for mobile usage</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-orange-200 bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-orange-700 sm:inline-flex">
            {isSpotlightVariant ? 'Experiment B' : 'Experiment A'}
          </span>
          <button
            type="button"
            className="rounded-full border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-orange-50"
            onClick={() => dismissForSession('close_button')}
          >
            Close
          </button>
        </div>

        <p className="text-xs text-muted-foreground">{description}</p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-orange-200 px-3 py-1 text-xs font-semibold text-foreground hover:bg-orange-50"
            onClick={onMinimize}
          >
            Later
          </button>
          <button
            type="button"
            className="flex-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            onClick={() => void onInstallClick('main_cta')}
            disabled={installing}
          >
            {primaryLabel}
          </button>
        </div>

        {installMode === 'ios_manual' && showIosGuide ? (
          <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-foreground/90">
            <p className="font-semibold">iPhone / iPad install steps:</p>
            <p>{iosStepOne}</p>
            <p>2. Tap &quot;Add to Home Screen&quot;.</p>
            <p>3. Keep &quot;Open as Web App&quot; enabled.</p>
            <p>4. Tap &quot;Add&quot;, then open KU BAZAR from your home screen.</p>
            {iosBrowserHint ? (
              <p className="rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-foreground/80">{iosBrowserHint}</p>
            ) : null}
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={onIosGuideDone}
            >
              I added it
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
