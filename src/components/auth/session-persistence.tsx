'use client';

import { useEffect } from 'react';

import { createClient } from '@/utils/supabase/client';

const SESSION_RECHECK_THROTTLE_MS = 30_000;

export default function SessionPersistence() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const supabase = createClient();
    let inflightRefresh: Promise<unknown> | null = null;
    let lastRecheckAt = 0;

    const recheckSession = () => {
      const now = Date.now();
      if (inflightRefresh || now - lastRecheckAt < SESSION_RECHECK_THROTTLE_MS) {
        return;
      }

      lastRecheckAt = now;
      inflightRefresh = supabase.auth
        .getSession()
        .catch(() => null)
        .finally(() => {
          inflightRefresh = null;
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        recheckSession();
      }
    };

    recheckSession();
    window.addEventListener('focus', recheckSession);
    window.addEventListener('online', recheckSession);
    window.addEventListener('pageshow', recheckSession);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', recheckSession);
      window.removeEventListener('online', recheckSession);
      window.removeEventListener('pageshow', recheckSession);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
}
