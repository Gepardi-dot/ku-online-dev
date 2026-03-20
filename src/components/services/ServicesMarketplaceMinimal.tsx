'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, Clock3, MapPin, MessageCircle, Phone, Search, ShieldCheck, Star, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import {
  MOCK_SERVICE_TYPE_LABELS,
  mockServiceProviders,
  type MockServicePricingModel,
  type MockServiceProvider,
  type MockServiceType,
} from '@/data/mock-services';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import { rtlLocales } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';
import { useLocale } from '@/providers/locale-provider';

const cityOptions = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all').map((option) => option.label);
const quickTypeButtons: Array<{ value: 'all' | MockServiceType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'ac-repair', label: 'AC' },
];

function formatIqD(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-IQ' : locale === 'ku' ? 'ku-IQ' : 'en-IQ', {
    style: 'currency',
    currency: 'IQD',
    maximumFractionDigits: 0,
  }).format(value);
}

function matchesSearch(service: MockServiceProvider, rawSearch: string) {
  const search = rawSearch.trim().toLowerCase();
  if (!search) return true;

  const haystack = [
    service.title,
    service.providerName,
    service.city,
    service.area,
    service.description,
    service.tags.join(' '),
    service.searchTerms.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search);
}

function compareServices(a: MockServiceProvider, b: MockServiceProvider) {
  const score = (service: MockServiceProvider) =>
    (service.featured ? 20 : 0) +
    (service.verified ? 14 : 0) +
    (service.availableToday ? 8 : 0) +
    service.rating * 7 +
    Math.min(service.reviewCount / 5, 16) -
    Math.min(service.responseMinutes / 10, 6);

  return score(b) - score(a);
}

function pricingLabel(pricingModel: MockServicePricingModel) {
  if (pricingModel === 'visit-fee') return 'Visit fee';
  if (pricingModel === 'fixed') return 'Fixed price';
  return 'Starts from';
}

function deliveryModeLabel(service: MockServiceProvider) {
  if (service.deliveryMode === 'both') return 'At home or in shop';
  if (service.deliveryMode === 'in-shop') return 'In shop';
  return 'At home';
}

function NativeSelect({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div className={cn('relative rounded-xl border border-slate-200 bg-white', className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-full w-full appearance-none rounded-xl bg-transparent px-3 py-2 pe-9 text-sm text-slate-700 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function ServiceCard({
  service,
  locale,
}: {
  service: MockServiceProvider;
  locale: string;
}) {
  const stats = [
    {
      key: 'mode',
      icon: service.deliveryMode === 'in-shop' ? Store : ShieldCheck,
      title: deliveryModeLabel(service),
      value: `jobs +${service.completedJobs}`,
    },
    {
      key: 'location',
      icon: MapPin,
      title: service.city,
      value: service.area,
    },
    {
      key: 'reply',
      icon: Clock3,
      title: `min ${service.responseMinutes}`,
      value: 'reply speed',
    },
    {
      key: 'rating',
      icon: Star,
      title: service.rating.toFixed(1),
      value: `reviews ${service.reviewCount}`,
    },
  ];

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-none">
      <CardContent className="p-0">
        <div className="grid grid-cols-[112px_1fr] gap-3 p-3 sm:grid-cols-[132px_1fr] sm:p-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
            <Image
              src={service.imageUrl}
              alt={service.title}
              fill
              sizes="(max-width: 640px) 112px, 132px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                    {MOCK_SERVICE_TYPE_LABELS[service.serviceType]}
                  </span>
                  {service.verified ? <VerifiedBadge variant="icon" size="xs" /> : null}
                  {service.availableToday ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                      Today
                    </span>
                  ) : null}
                </div>
                <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 sm:text-base">
                  {service.title}
                </h2>
                <p className="truncate text-xs text-slate-500 sm:text-sm">{service.providerName}</p>
              </div>

              <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-right">
                <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  {pricingLabel(service.pricingModel)}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950 sm:text-base">
                  {formatIqD(service.startingPrice, locale)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                  <div key={stat.key} className="rounded-2xl bg-slate-100 px-3 py-2 text-center text-slate-600">
                    <div className="inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-slate-700">
                      <span>{stat.title}</span>
                      <Icon className={cn('h-3.5 w-3.5', stat.key === 'rating' && 'text-amber-500')} />
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500">{stat.value}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="min-w-0 flex-1">
                Request quote
              </Button>
              <Button size="sm" variant="outline" className="min-w-0 flex-1">
                <MessageCircle className="h-4 w-4" />
                Chat
              </Button>
              <Button size="sm" variant="ghost" asChild className="shrink-0 px-3">
                <a href={`tel:${service.phone}`}>
                  <Phone className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ServicesMarketplacePreview() {
  const { locale } = useLocale();
  const isRtl = rtlLocales.includes(locale);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | MockServiceType>('all');
  const [selectedCity, setSelectedCity] = useState<'all' | string>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [availableTodayOnly, setAvailableTodayOnly] = useState(false);
  const [atHomeOnly, setAtHomeOnly] = useState(false);

  const deferredSearch = useDeferredValue(search);

  const filteredServices = useMemo(() => {
    const next = mockServiceProviders.filter((service) => {
      if (selectedType !== 'all' && service.serviceType !== selectedType) return false;
      if (selectedCity !== 'all' && service.city !== selectedCity) return false;
      if (verifiedOnly && !service.verified) return false;
      if (availableTodayOnly && !service.availableToday) return false;
      if (atHomeOnly && service.deliveryMode === 'in-shop') return false;
      if (!matchesSearch(service, deferredSearch)) return false;
      return true;
    });

    return next.sort((a, b) => compareServices(a, b));
  }, [atHomeOnly, availableTodayOnly, deferredSearch, selectedCity, selectedType, verifiedOnly]);

  const summary = useMemo(() => {
    const verifiedCount = filteredServices.filter((service) => service.verified).length;
    const availableCount = filteredServices.filter((service) => service.availableToday).length;

    return {
      total: filteredServices.length,
      verified: verifiedCount,
      available: availableCount,
    };
  }, [filteredServices]);

  const clearFilters = () => {
    setSearch('');
    setSelectedType('all');
    setSelectedCity('all');
    setVerifiedOnly(false);
    setAvailableTodayOnly(false);
    setAtHomeOnly(false);
  };

  return (
    <div className="bg-slate-50">
      <section className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <Card className="max-w-[780px] border-slate-200 bg-white shadow-none">
            <CardContent className="space-y-3 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search services"
                    className="h-auto border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  />
                </label>

                <NativeSelect
                  value={selectedCity}
                  onChange={setSelectedCity}
                  ariaLabel="City"
                  options={[
                    { value: 'all', label: 'All cities' },
                    ...cityOptions.map((city) => ({ value: city, label: city })),
                  ]}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {quickTypeButtons.map((option) => {
                  const active = selectedType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedType(option.value)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm transition',
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                  <Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
                  <span>Verified</span>
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                  <Switch checked={availableTodayOnly} onCheckedChange={setAvailableTodayOnly} />
                  <span>Today</span>
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                  <Switch checked={atHomeOnly} onCheckedChange={setAtHomeOnly} />
                  <span>At home</span>
                </label>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="container mx-auto px-4 py-4 sm:py-5">
        <div className={cn('mb-3 text-sm text-slate-500', isRtl && 'text-right')}>
          {summary.total} services · {summary.verified} verified · {summary.available} today
        </div>

        {filteredServices.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white shadow-none">
            <CardContent className="space-y-3 p-8 text-center">
              <h3 className="text-lg font-medium text-slate-950">No providers match those filters</h3>
              <p className="text-sm text-slate-600">
                Try a broader city or service type.
              </p>
              <div>
                <Button variant="outline" onClick={clearFilters}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredServices.map((service) => (
              <ServiceCard key={service.id} service={service} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
