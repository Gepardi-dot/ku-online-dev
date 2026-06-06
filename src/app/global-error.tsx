'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

const PWA_ERROR_RECOVERY_KEY = 'ku_pwa_error_recovery_v1';

async function recoverFromStaleServiceWorkerState() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (window.sessionStorage.getItem(PWA_ERROR_RECOVERY_KEY) === '1') {
      return;
    }
    window.sessionStorage.setItem(PWA_ERROR_RECOVERY_KEY, '1');
  } catch {
    const marker = `[${PWA_ERROR_RECOVERY_KEY}]`;
    if (window.name.includes(marker)) {
      return;
    }
    window.name = `${window.name}${marker}`;
  }

  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('offline-') || name.startsWith('asset-') || name.startsWith('image-'))
          .map((name) => window.caches.delete(name)),
      );
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } finally {
    window.location.reload();
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    void recoverFromStaleServiceWorkerState();
  }, [error]);

  return (
    <html>
      <body>
        <div className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            We have logged this issue and will look into it. You can try again or return to the homepage.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => reset()}
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
