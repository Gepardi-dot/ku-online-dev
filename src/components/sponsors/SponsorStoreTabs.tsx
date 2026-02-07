'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/providers/locale-provider';
import { rtlLocales } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';

type SponsorStoreTabsProps = {
  initialTab: 'products' | 'services';
  productsLabel: string;
  servicesLabel: string;
  productsCount: number;
  servicesCount: number;
  dealsLabel?: string | null;
  products: ReactNode;
  services: ReactNode;
  className?: string;
};

export function SponsorStoreTabs({
  initialTab,
  productsLabel,
  servicesLabel,
  productsCount,
  servicesCount,
  dealsLabel,
  products,
  services,
  className,
}: SponsorStoreTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const isRtl = rtlLocales.includes(locale);

  const queryTab = (searchParams.get('tab') ?? '').trim().toLowerCase();
  const queryValue = queryTab === 'services' || queryTab === 'products' ? (queryTab as 'products' | 'services') : null;
  const initialValue = queryValue ?? initialTab;

  const [value, setValue] = useState<'products' | 'services'>(initialValue);

  // Keep UI in sync with back/forward navigation or server-set query params.
  useEffect(() => {
    if (queryValue && queryValue !== value) {
      setValue(queryValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryValue]);

  const nextHrefFor = useMemo(() => {
    return (nextValue: 'products' | 'services') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', nextValue);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    };
  }, [pathname, searchParams]);

  const onValueChange = (nextValue: string) => {
    const normalized = nextValue === 'services' ? 'services' : 'products';
    setValue(normalized);
    router.replace(nextHrefFor(normalized), { scroll: false });
  };

  const tabCardClassName = cn(
    'group relative inline-flex w-auto min-w-[128px] max-w-[220px] justify-between overflow-hidden rounded-xl border px-3 py-2 text-sm font-semibold',
    'text-[#111827] shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-black/5',
    // Glass base.
    'bg-white/28 backdrop-blur-2xl border-white/55',
    // Soft highlight layer.
    "before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.75),transparent_58%)] before:opacity-80 before:content-['']",
    // Subtle sheen.
    "after:absolute after:inset-x-4 after:bottom-2 after:h-[3px] after:rounded-full after:bg-transparent after:content-[''] after:transition-all after:duration-300",
    // Hover/active states.
    'transition will-change-transform hover:-translate-y-[1px] hover:bg-white/34 hover:shadow-[0_16px_38px_rgba(15,23,42,0.12)]',
    'data-[state=active]:-translate-y-[1px] data-[state=active]:bg-white/45 data-[state=active]:border-white/75 data-[state=active]:shadow-[0_18px_46px_rgba(15,23,42,0.16)]',
    'data-[state=active]:after:bg-gradient-to-r data-[state=active]:after:from-brand/0 data-[state=active]:after:via-brand data-[state=active]:after:to-brand/0 data-[state=active]:after:opacity-80 data-[state=active]:after:blur-[0.5px]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/60',
  );

  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn('space-y-3', className)}>
      <TabsList
        className={cn(
          'flex h-auto w-full items-stretch justify-start gap-2 rounded-none bg-transparent p-0',
          isRtl && 'justify-end',
        )}
      >
        {isRtl ? (
          <>
            <TabsTrigger
              value="services"
              className={tabCardClassName}
            >
              <span className="relative z-10 min-w-0">
                <span dir="auto" className="bidi-auto block truncate">
                  {servicesLabel}
                </span>
              </span>
              <span className="relative z-10 ml-2 shrink-0 rounded-full bg-white/40 px-2 py-0.5 text-[11px] font-extrabold text-[#4B5563] ring-1 ring-white/55">
                {servicesCount}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="products"
              className={tabCardClassName}
            >
              <span className="relative z-10 min-w-0">
                <span dir="auto" className="bidi-auto block truncate">
                  {productsLabel}
                </span>
              </span>
              <span className="relative z-10 ml-2 shrink-0 rounded-full bg-white/40 px-2 py-0.5 text-[11px] font-extrabold text-[#4B5563] ring-1 ring-white/55">
                {productsCount}
              </span>
            </TabsTrigger>
          </>
        ) : (
          <>
            <TabsTrigger
              value="products"
              className={tabCardClassName}
            >
              <span className="relative z-10 min-w-0">
                <span dir="auto" className="bidi-auto block truncate">
                  {productsLabel}
                </span>
              </span>
              <span className="relative z-10 ml-2 shrink-0 rounded-full bg-white/40 px-2 py-0.5 text-[11px] font-extrabold text-[#4B5563] ring-1 ring-white/55">
                {productsCount}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="services"
              className={tabCardClassName}
            >
              <span className="relative z-10 min-w-0">
                <span dir="auto" className="bidi-auto block truncate">
                  {servicesLabel}
                </span>
              </span>
              <span className="relative z-10 ml-2 shrink-0 rounded-full bg-white/40 px-2 py-0.5 text-[11px] font-extrabold text-[#4B5563] ring-1 ring-white/55">
                {servicesCount}
              </span>
            </TabsTrigger>
          </>
        )}
      </TabsList>

      <TabsContent value="products" className="mt-0">
        {products}
      </TabsContent>
      <TabsContent value="services" className="mt-0">
        {services}
      </TabsContent>
    </Tabs>
  );
}
