"use client";

import { useEffect, useState, useTransition } from 'react';
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
  showSearchInput?: boolean;
  showCategorySelect?: boolean;
  priceInputMode?: 'input' | 'select';
}

export function ProductsFilterBar({
  categories,
  locations,
  initialValues,
  targetPath = '/products',
  showSearchInput = true,
  showCategorySelect = true,
  priceInputMode = 'input',
}: ProductsFilterBarProps) {
  const router = useRouter();
  const [values, setValues] = useState<ProductsFilterValues>(initialValues);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValues({ ...initialValues });
  }, [initialValues]);

  const applyFilters = (nextValues: ProductsFilterValues) => {
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

    const queryString = params.toString();

    startTransition(() => {
      router.replace(queryString ? `${targetPath}?${queryString}` : targetPath, { scroll: true });
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

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'grid gap-3 rounded-xl border bg-card p-4 shadow-sm',
        'md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6',
      )}
    >
      {showSearchInput && (
        <div className="lg:col-span-2">
          <Input
            value={values.search}
            onChange={(event) => setValues((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search for products, brands, or keywords"
          />
        </div>
      )}

      {showCategorySelect && (
        <div>
          <Select
            value={values.category}
            onValueChange={(value) => handleImmediateChange({ category: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Select
          value={values.condition}
          onValueChange={(value) => handleImmediateChange({ condition: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any condition" />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPTIONS.map((option) => (
              <SelectItem key={option.value || 'all'} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Select value={values.location} onValueChange={(value) => handleImmediateChange({ location: value })}>
          <SelectTrigger>
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All cities</SelectItem>
            {locations.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {priceInputMode === 'select' ? (
        <div className="grid grid-cols-2 gap-2">
          <Select value={values.minPrice} onValueChange={handleMinPriceChange}>
            <SelectTrigger>
              <SelectValue placeholder="Min price" />
            </SelectTrigger>
            <SelectContent>
              {PRICE_OPTION_VALUES.map((option) => (
                <SelectItem key={`min-${option || 'any'}`} value={option}>
                  {option ? `From ${formatPriceLabel(option)}` : 'No minimum'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={values.maxPrice} onValueChange={handleMaxPriceChange}>
            <SelectTrigger>
              <SelectValue placeholder="Max price" />
            </SelectTrigger>
            <SelectContent>
              {PRICE_OPTION_VALUES.map((option) => (
                <SelectItem key={`max-${option || 'any'}`} value={option}>
                  {option ? `Up to ${formatPriceLabel(option)}` : 'No maximum'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Min price"
            value={values.minPrice}
            onChange={(event) => setValues((prev) => ({ ...prev, minPrice: event.target.value }))}
          />
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Max price"
            value={values.maxPrice}
            onChange={(event) => setValues((prev) => ({ ...prev, maxPrice: event.target.value }))}
          />
        </div>
      )}

      <div>
        <Select value={values.postedWithin} onValueChange={(value) => handlePostedWithinChange(value as PostedWithin)}>
          <SelectTrigger>
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

      <div>
        <Select value={values.sort} onValueChange={(value) => handleImmediateChange({ sort: value as ProductSort })}>
          <SelectTrigger>
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

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end lg:col-span-2 xl:col-span-1">
        <Button type="submit" disabled={isPending}>
          Apply filters
        </Button>
        <Button type="button" variant="outline" onClick={handleReset} disabled={isPending}>
          Reset
        </Button>
      </div>
    </form>
  );
}
