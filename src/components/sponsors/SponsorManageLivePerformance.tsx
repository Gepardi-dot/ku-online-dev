'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Heart, MousePointerClick } from 'lucide-react';

import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorStoreLiveStats } from '@/lib/services/sponsors';
import { createClient } from '@/utils/supabase/client';

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function SponsorManageLivePerformance({
  storeId,
  locale,
  initialStats,
  title,
  subtitle,
  viewsLabel,
  likesLabel,
}: {
  storeId: string;
  locale: Locale;
  initialStats: SponsorStoreLiveStats;
  title: string;
  subtitle: string;
  viewsLabel: string;
  likesLabel: string;
}) {
  const [stats, setStats] = useState<SponsorStoreLiveStats>(initialStats);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sponsor-manage-live-stats:${storeId}`)
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
            totalClicks: Math.max(0, toNumber(row.total_clicks)),
            totalLikes: Math.max(0, toNumber(row.total_likes)),
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
    <div className="mb-6 rounded-[24px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
      <div className="flex items-center gap-2 text-[#111827]">
        <Activity className="h-4 w-4 text-brand" aria-hidden="true" />
        <h2 className="text-base font-extrabold" dir="auto">
          {title}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground" dir="auto">
        {subtitle}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm ring-1 ring-black/5">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <MousePointerClick className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold" dir="auto">{viewsLabel}</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-[#111827]" dir="auto">
            {numberFormatter.format(Math.max(0, stats.totalClicks))}
          </p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm ring-1 ring-black/5">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <Heart className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold" dir="auto">{likesLabel}</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-[#111827]" dir="auto">
            {numberFormatter.format(Math.max(0, stats.totalLikes))}
          </p>
        </div>
      </div>
    </div>
  );
}
