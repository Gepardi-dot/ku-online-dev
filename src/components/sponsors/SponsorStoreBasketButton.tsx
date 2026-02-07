'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SponsorBasketItem = {
  id: string;
  title: string;
  price: number;
  currency: string | null;
};

type SponsorStoreBasketButtonProps = {
  basketKey: string;
  item: SponsorBasketItem;
  className?: string;
};

type StoredBasket = {
  items: Array<SponsorBasketItem & { qty: number }>;
};

const CHANGE_EVENT = 'ku:sponsorBasket:changed';

function readBasket(key: string): StoredBasket {
  if (!key) return { items: [] };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Partial<StoredBasket>;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items: items
        .filter((it) => it && typeof it.id === 'string')
        .map((it) => ({
          id: String((it as any).id),
          title: String((it as any).title ?? ''),
          price: Number((it as any).price ?? 0),
          currency: typeof (it as any).currency === 'string' ? (it as any).currency : null,
          qty: Number((it as any).qty ?? 1) || 1,
        })),
    };
  } catch {
    return { items: [] };
  }
}

function writeBasket(key: string, basket: StoredBasket) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(basket));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
  } catch {}
}

export function SponsorStoreBasketButton({ basketKey, item, className }: SponsorStoreBasketButtonProps) {
  const key = basketKey.trim();
  const [inBasket, setInBasket] = useState(false);

  const normalizedItem = useMemo(
    () => ({
      id: item.id,
      title: item.title,
      price: Number(item.price),
      currency: item.currency ?? null,
    }),
    [item.currency, item.id, item.price, item.title],
  );

  useEffect(() => {
    if (!key) return;
    const compute = () => {
      const basket = readBasket(key);
      setInBasket(basket.items.some((entry) => entry.id === normalizedItem.id));
    };
    compute();

    const onChange = (event: Event) => {
      const detailKey = (event as any)?.detail?.key;
      if (detailKey && detailKey !== key) return;
      compute();
    };

    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [key, normalizedItem.id]);

  const toggle = () => {
    if (!key) return;
    const basket = readBasket(key);
    const exists = basket.items.some((entry) => entry.id === normalizedItem.id);
    const nextItems = exists
      ? basket.items.filter((entry) => entry.id !== normalizedItem.id)
      : [{ ...normalizedItem, qty: 1 }, ...basket.items];
    writeBasket(key, { items: nextItems });
  };

  return (
    <button
      type="button"
      aria-label={inBasket ? 'Remove from basket' : 'Add to basket'}
      onClick={toggle}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-[#111827] shadow-sm ring-1 ring-black/10 transition active:scale-[0.98] sm:hover:bg-white',
        inBasket ? 'bg-brand text-white ring-brand/30 sm:hover:bg-brand/90' : null,
        className,
      )}
    >
      <ShoppingCart className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
