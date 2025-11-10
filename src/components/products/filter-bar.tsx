"use client";

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CONDITION_OPTIONS,
  DEFAULT_FILTER_VALUES,
  POSTED_WITHIN_OPTIONS,
  type PostedWithin,
  type ProductsFilterValues,
  SORT_OPTIONS,
} from '@/lib/products/filter-params';
import type { ProductSort } from '@/lib/services/products';
export type { ProductsFilterValues, PostedWithin } from '@/lib/products/filter-params';
import { fromOption, fromOptionAll, toOption, toOptionAll } from '@/components/ui/selectEmptyValue';

const PRICE_OPTION_VALUES = [
  '',
  '25000',
  '50000',
  '100000',
  '250000',
  '500000',
  '1000000',
  '2000000',
  '5000000',
];

function formatPriceLabel(value: string) {
  if (!value) {
    return 'Any';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'IQD',
    maximumFractionDigits: 0,
  });

  return formatter.format(numeric);
}

interface ProductsFilterBarProps {
  categories: { id: string; name: string }[];
  locations: string[];
  initialValues: ProductsFilterValues;
  targetPath?: string;
  showCategorySelect?: boolean;
  priceInputMode?: 'input' | 'select';
}

export function ProductsFilterBar({
  categories,
  locations,
  initialValues,
  targetPath = '/products',
  showCategorySelect = true,
  priceInputMode = 'input',
}: ProductsFilterBarProps) {
  const router = useRouter();
  const [values, setValues] = useState<ProductsFilterValues>(initialValues);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValues({ ...initialValues });
  }, [initialValues]);

  const applyFilters = (nextValues: ProductsFilterValues) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const params = new URLSearchParams();

    const trimmedSearch = nextValues.search.trim();
    if (trimmedSearch) {
      params.set('search', trimmedSearch);
    }

    if (nextValues.category) {
      params.set('category', nextValues.category);
    }

    if (nextValues.condition) {
      params.set('condition', nextValues.condition);
    }

    if (nextValues.location) {
      params.set('location', nextValues.location);
    }

    if (nextValues.minPrice) {
      params.set('minPrice', nextValues.minPrice);
    }

    if (nextValues.maxPrice) {
      params.set('maxPrice', nextValues.maxPrice);
    }

    if (nextValues.sort && nextValues.sort !== 'newest') {
      params.set('sort', nextValues.sort);
    }

    if (nextValues.postedWithin && nextValues.postedWithin !== 'any') {
      params.set('postedWithin', nextValues.postedWithin);
    }

    if (nextValues.freeOnly) {
      params.set('free', '1');
    }

    const queryString = params.toString();

    startTransition(() => {
      router.replace(queryString ? `${targetPath}?${queryString}` : targetPath, { scroll: true });
    });
  };

  const scheduleFilterUpdate = (nextValues: ProductsFilterValues) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      applyFilters(nextValues);
    }, 400);
  };

  const updateValuesWithDebounce = (updater: (prev: ProductsFilterValues) => ProductsFilterValues) => {
    setValues((prev) => {
      const next = updater(prev);
      scheduleFilterUpdate(next);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyFilters(values);
  };

  const handleReset = () => {
    const reset: ProductsFilterValues = { ...DEFAULT_FILTER_VALUES };
    setValues(reset);
    applyFilters(reset);
  };

  const handleImmediateChange = (partial: Partial<ProductsFilterValues>) => {
    const nextValues = { ...values, ...partial };
    setValues(nextValues);
    applyFilters(nextValues);
  };

  const handleMinPriceChange = (value: string) => {
    const nextValues = { ...values, minPrice: value };
    if (value && nextValues.maxPrice && Number(value) > Number(nextValues.maxPrice)) {
      nextValues.maxPrice = '';
    }
    setValues(nextValues);
    applyFilters(nextValues);
  };

  const handleMaxPriceChange = (value: string) => {
    const nextValues = { ...values, maxPrice: value };
    if (value && nextValues.minPrice && Number(value) < Number(nextValues.minPrice)) {
      nextValues.minPrice = '';
    }
    setValues(nextValues);
    applyFilters(nextValues);
  };

  const handlePostedWithinChange = (value: PostedWithin) => {
    handleImmediateChange({ postedWithin: value });
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
    >
      {showCategorySelect && (
        <div className="flex-shrink-0">
          <Select
            value={values.category}
            onValueChange={(value) => {
              const id = fromOptionAll(value);
              if (!id) {
                handleImmediateChange({ category: '' });
                return;
              }
              const selected = categories.find((c) => c.id === id);
              const label = (selected?.name ?? '').toLowerCase();
              const isFree = ['free', 'مجاني', 'مجانا', 'فري', 'بلاش'].some((kw) => label.includes(kw));
              if (isFree) {
                handleImmediateChange({ category: '', minPrice: '0', maxPrice: '0' });
              } else {
                handleImmediateChange({ category: id });
              }
            }}
          >
            <SelectTrigger className="h-9 w-auto min-w-[8rem] whitespace-nowrap rounded-full px-3">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex-shrink-0">
        <Select
          value={toOption(values.condition)}
          onValueChange={(value) =>
            handleImmediateChange({
              condition: fromOption(value) as ProductsFilterValues['condition'],
            })
          }
        >
          <SelectTrigger className="h-9 w-auto min-w-[8rem] whitespace-nowrap rounded-full px-3">
            <SelectValue placeholder="Any condition" />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPTIONS.map((option) => (
              <SelectItem key={option.value || 'any'} value={toOption(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {locations.length > 0 && (
        <div className="flex-shrink-0">
          <Select
            value={values.location}
            onValueChange={(value) => handleImmediateChange({ location: fromOptionAll(value) })}
          >
            <SelectTrigger className="h-9 w-auto min-w-[7.5rem] whitespace-nowrap rounded-full px-3">
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {locations.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {priceInputMode === 'select' ? (
        <div className="flex flex-row gap-2 flex-shrink-0">
          <Select value={values.minPrice} onValueChange={(v) => handleMinPriceChange(fromOption(v))}>
            <SelectTrigger className="h-9 w-auto min-w-[7rem] whitespace-nowrap rounded-full px-3">
              <SelectValue placeholder="Min price" />
            </SelectTrigger>
            <SelectContent>
              {PRICE_OPTION_VALUES.map((option) => (
                <SelectItem key={`min-${option || 'any'}`} value={toOption(option)}>
                  {option ? `From ${formatPriceLabel(option)}` : 'No minimum'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={values.maxPrice} onValueChange={(v) => handleMaxPriceChange(fromOption(v))}>
            <SelectTrigger className="h-9 w-auto min-w-[7rem] whitespace-nowrap rounded-full px-3">
              <SelectValue placeholder="Max price" />
            </SelectTrigger>
            <SelectContent>
              {PRICE_OPTION_VALUES.map((option) => (
                <SelectItem key={`max-${option || 'any'}`} value={toOption(option)}>
                  {option ? `Up to ${formatPriceLabel(option)}` : 'No maximum'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex flex-row gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Min price"
            value={values.minPrice}
            onChange={(event) =>
              updateValuesWithDebounce((prev) => ({ ...prev, minPrice: event.target.value }))
            }
            className="h-9 w-24 rounded-full px-3"
          />
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Max price"
            value={values.maxPrice}
            onChange={(event) =>
              updateValuesWithDebounce((prev) => ({ ...prev, maxPrice: event.target.value }))
            }
            className="h-9 w-24 rounded-full px-3"
          />
        </div>
      )}

      <div className="flex-shrink-0">
        <Select value={values.postedWithin} onValueChange={(value) => handlePostedWithinChange(value as PostedWithin)}>
          <SelectTrigger className="h-9 w-auto min-w-[7.5rem] whitespace-nowrap rounded-full px-3">
            <SelectValue placeholder="Listed within" />
          </SelectTrigger>
          <SelectContent>
            {POSTED_WITHIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-shrink-0">
        <Select value={values.sort} onValueChange={(value) => handleImmediateChange({ sort: value as ProductSort })}>
          <SelectTrigger className="h-9 w-auto min-w-[6.5rem] whitespace-nowrap rounded-full px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-row gap-2 ml-auto">
        <Button type="submit" disabled={isPending} className="h-9 rounded-full px-4">
          Apply filters
        </Button>
        <Button type="button" variant="outline" onClick={handleReset} disabled={isPending} className="h-9 rounded-full px-4">
          Reset
        </Button>
      </div>
    </form>
  );
}
