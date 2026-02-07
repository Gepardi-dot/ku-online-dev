'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorStoreLiveStats } from '@/lib/services/sponsors';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

type SponsorStoreLiveStatsChipProps = {
  storeId: string;
  locale: Locale;
  initialStats: SponsorStoreLiveStats | null;
  viewsLabel: string;
  likesLabel: string;
  className?: string;
};

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function SponsorStoreLiveStatsChip({
  storeId,
  locale,
  initialStats,
  viewsLabel,
  likesLabel,
  className,
}: SponsorStoreLiveStatsChipProps) {
  const [stats, setStats] = useState<SponsorStoreLiveStats>(
    initialStats ?? {
      storeId,
      totalClicks: 0,
      totalLikes: 0,
      lastClickAt: null,
      updatedAt: null,
    },
  );
  const [metric, setMetric] = useState<'views' | 'likes'>('views');

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  const viewsCount = numberFormatter.format(Math.max(0, stats.totalClicks));
  const likesCount = numberFormatter.format(Math.max(0, stats.totalLikes));

  useEffect(() => {
    setStats(
      initialStats ?? {
        storeId,
        totalClicks: 0,
        totalLikes: 0,
        lastClickAt: null,
        updatedAt: null,
      },
    );
  }, [initialStats, storeId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMetric((prev) => (prev === 'views' ? 'likes' : 'views'));
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sponsor-store-live-stats:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sponsor_store_live_stats',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const row = payload.new as {
            store_id?: string;
            total_clicks?: number | string | null;
            total_likes?: number | string | null;
            last_click_at?: string | null;
            updated_at?: string | null;
          };

          if (!row?.store_id) return;

          setStats((prev) => ({
            ...prev,
            storeId: row.store_id ?? prev.storeId,
            totalClicks: Math.max(0, parseNumber(row.total_clicks)),
            totalLikes: Math.max(0, parseNumber(row.total_likes)),
            lastClickAt: row.last_click_at ? new Date(row.last_click_at) : prev.lastClickAt,
            updatedAt: row.updated_at ? new Date(row.updated_at) : prev.updatedAt,
          }));
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [storeId]);

  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow-[0_4px_14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 backdrop-blur-sm',
        className,
      )}
    >
      <span className="relative block h-3.5 min-w-[86px] overflow-hidden text-left leading-none" aria-live="polite" dir="auto">
        <span
          className={cn(
            'absolute inset-0 flex items-center whitespace-nowrap transition-all duration-[2000ms] motion-reduce:transition-none',
            metric === 'views' ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
          )}
        >
          <span className="font-extrabold text-emerald-600">{viewsCount}</span>
          <span className="ml-1 text-emerald-700">{viewsLabel}</span>
        </span>
        <span
          className={cn(
            'absolute inset-0 flex items-center whitespace-nowrap transition-all duration-[2000ms] motion-reduce:transition-none',
            metric === 'likes' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
          )}
        >
          <span className="font-extrabold text-rose-600">{likesCount}</span>
          <span className="ml-1 text-rose-700">{likesLabel}</span>
        </span>
      </span>
    </div>
  );
}
