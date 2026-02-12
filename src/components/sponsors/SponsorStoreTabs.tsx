'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
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
    'inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-3.5 text-sm font-semibold text-[#5B5B5B] transition',
    'bg-[#E8E3DF] hover:bg-[#E2DBD6]',
    'data-[state=active]:border-black/10 data-[state=active]:bg-white data-[state=active]:text-[#1F2937] data-[state=active]:shadow-sm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
  );

  const servicesTrigger = (
    <TabsTrigger value="services" className={tabCardClassName}>
      <span dir="auto" className="bidi-auto truncate">
        {servicesLabel}
      </span>
      <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
    </TabsTrigger>
  );

  const productsTrigger = (
    <TabsTrigger value="products" className={tabCardClassName}>
      <span dir="auto" className="bidi-auto truncate">
        {productsLabel}
      </span>
    </TabsTrigger>
  );

  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn('space-y-3', className)}>
      <TabsList
        className={cn(
          'inline-flex h-auto items-center gap-1 rounded-full bg-transparent p-0',
          isRtl && 'justify-end',
        )}
      >
        {isRtl ? (
          <>
            {servicesTrigger}
            {productsTrigger}
          </>
        ) : (
          <>
            {productsTrigger}
            {servicesTrigger}
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
