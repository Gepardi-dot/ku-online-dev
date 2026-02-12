'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Trash2 } from 'lucide-react';

import { appendWhatsAppText } from '@/lib/contact-links';
import { cn } from '@/lib/utils';
import { applyArabicComma, getNumberLocale } from '@/lib/locale/formatting';

type SponsorStoreBasketBarProps = {
  basketKey: string;
  storeName: string;
  waAppHref: string | null;
  waWebHref: string | null;
  locale: 'en' | 'ar' | 'ku';
  sendLabel: string;
  basketLabel: string;
  clearLabel: string;
};

type StoredBasket = {
  items: Array<{
    id: string;
    title: string;
    price: number;
    currency: string | null;
    href?: string | null;
    imageUrl?: string | null;
    qty: number;
  }>;
};

const CHANGE_EVENT = 'ku:sponsorBasket:changed';

function readBasket(key: string): StoredBasket {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Partial<StoredBasket>;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items: items
        .filter((it) => it && typeof (it as any).id === 'string')
        .map((it) => ({
          id: String((it as any).id),
          title: String((it as any).title ?? ''),
          price: Number((it as any).price ?? 0),
          currency: typeof (it as any).currency === 'string' ? (it as any).currency : null,
          href: typeof (it as any).href === 'string' ? (it as any).href : null,
          imageUrl: typeof (it as any).imageUrl === 'string' ? (it as any).imageUrl : null,
          qty: Number((it as any).qty ?? 1) || 1,
        })),
    };
  } catch {
    return { items: [] };
  }
}

function writeBasket(key: string, basket: StoredBasket) {
  try {
    localStorage.setItem(key, JSON.stringify(basket));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
  } catch {}
}

function formatCurrencyInline(amount: number, currency: string | null, locale: 'en' | 'ar' | 'ku') {
  const code = (currency ?? '').trim().toUpperCase();
  const numberLocale = getNumberLocale(locale);
  if (!code || code === 'IQD') {
    const formatted = applyArabicComma(
      new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(Math.round(amount)),
      locale,
    );
    return `${formatted} IQD`;
  }
  const formatted = applyArabicComma(
    new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(amount),
    locale,
  );
  return `${formatted} ${code}`;
}

function toAbsoluteUrl(value: string | null | undefined, origin: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && origin) return `${origin}${trimmed}`;
  return null;
}

export function SponsorStoreBasketBar({
  basketKey,
  storeName,
  waAppHref,
  waWebHref,
  locale,
  sendLabel,
  basketLabel,
  clearLabel,
}: SponsorStoreBasketBarProps) {
  const key = basketKey.trim();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<StoredBasket['items']>([]);

  useEffect(() => {
    if (!key) return;
    const sync = () => {
      const basket = readBasket(key);
      setItems(basket.items ?? []);
      const next = (basket.items ?? []).reduce((sum, it) => sum + (Number(it.qty) || 1), 0);
      setCount(next);
    };
    sync();

    const onChange = (event: Event) => {
      const detailKey = (event as any)?.detail?.key;
      if (detailKey && detailKey !== key) return;
      sync();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [key]);

  const canSend = Boolean(waWebHref && count > 0);

  const message = useMemo(() => {
    if (!items.length) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : null;
    const header = locale === 'ar'
      ? `مرحباً ${storeName}، أريد هذه المنتجات:`
      : locale === 'ku'
        ? `سڵاو ${storeName}، ئەمانە دەوێتم:`
        : `Hi ${storeName}, I'm interested in:`;
    const lines = items.slice(0, 12).flatMap((it) => {
      const productLine = `- ${it.title} (${formatCurrencyInline(it.price, it.currency, locale)})`;
      const link = toAbsoluteUrl(it.href ?? null, origin);
      const image = toAbsoluteUrl(it.imageUrl ?? null, origin);
      const details = [link ? `  Link: ${link}` : null, image ? `  Image: ${image}` : null].filter(Boolean);
      return [productLine, ...details];
    });
    const footer = locale === 'ar'
      ? 'من خلال KU BAZAR'
      : locale === 'ku'
        ? 'لە ڕێگەی KU BAZAR'
        : 'From KU BAZAR';
    return [header, ...lines, footer].join('\n');
  }, [items, locale, storeName]);

  const openWhatsApp = () => {
    if (!waWebHref || !message) return;
    const webUrl = appendWhatsAppText(waWebHref, message);
    const appUrl = waAppHref ? appendWhatsAppText(waAppHref, message) : null;

    if (!appUrl) {
      window.location.assign(webUrl);
      return;
    }

    let timeoutId = 0;
    let shouldFallback = true;

    const cleanup = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
      window.removeEventListener('pagehide', onPageHide, true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        shouldFallback = false;
        cleanup();
      }
    };

    const onPageHide = () => {
      shouldFallback = false;
      cleanup();
    };

    document.addEventListener('visibilitychange', onVisibilityChange, true);
    window.addEventListener('pagehide', onPageHide, true);

    timeoutId = window.setTimeout(() => {
      cleanup();
      if (shouldFallback) {
        window.location.assign(webUrl);
      }
    }, 1100);

    try {
      window.location.assign(appUrl);
    } catch {
      cleanup();
      window.location.assign(webUrl);
    }
  };

  const clear = () => {
    if (!key) return;
    writeBasket(key, { items: [] });
  };

  if (!count) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0px)]">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-white/70 bg-white/85 p-3 shadow-[0_16px_44px_rgba(15,23,42,0.16)] ring-1 ring-black/5 backdrop-blur">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[#111827]" dir="auto">
              {basketLabel} ({count})
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-muted-foreground" dir="auto">
              {storeName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-muted-foreground ring-1 ring-black/10 transition active:scale-[0.98] sm:hover:bg-white/90"
              aria-label={clearLabel}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={openWhatsApp}
              disabled={!canSend}
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold transition active:scale-[0.98]',
                canSend
                  ? 'bg-brand text-white shadow-[0_14px_34px_rgba(247,111,29,0.24)] hover:bg-brand/90'
                  : 'bg-muted text-muted-foreground opacity-70',
              )}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {sendLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
