"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONDITION_OPTIONS,
  DEFAULT_FILTER_VALUES,
  type ProductsFilterValues,
  createProductsSearchParams,
} from "@/lib/products/filter-params";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type CategoryOption = { id: string; name: string };

interface ProductsFilterBarProps {
  categories?: CategoryOption[];
  locations: string[];
  initialValues?: ProductsFilterValues;
  targetPath?: string;
  showCategorySelect?: boolean;
  priceInputMode?: "select" | "input"; // kept for compatibility only
}

const MAX_PRICE_DEFAULT = 2_000_000; // IQD default cap used for the range when no values present

function useInitialState(initial?: ProductsFilterValues) {
  const base = initial ?? DEFAULT_FILTER_VALUES;
  const parse = (s: string | undefined) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const min = parse(base.minPrice);
  const max = parse(base.maxPrice);
  const maxCap = Math.max(MAX_PRICE_DEFAULT, max ?? 0);
  return {
    condition: base.condition ?? "",
    location: base.location ?? "",
    sort: base.sort ?? "newest",
    minPrice: min,
    maxPrice: max,
    maxCap,
  } as const;
}

function formatIQD(value: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "IQD",
      maximumFractionDigits: 0,
    })
      .format(value)
      .replace("IQD", "IQD");
  } catch {
    return `${value}`;
  }
}

export function ProductsFilterBar({
  locations,
  initialValues,
  targetPath = "/products",
  showCategorySelect = false, // API compatibility
}: ProductsFilterBarProps) {
  const router = useRouter();
  const init = useInitialState(initialValues);

  const [condition, setCondition] = useState<string>(init.condition || "");
  const [location, setLocation] = useState<string>(init.location || "");
  const [sort, setSort] = useState<string>(init.sort || "newest");
  const [price, setPrice] = useState<[number, number]>([
    init.minPrice ?? 0,
    init.maxPrice ?? init.maxCap,
  ]);

  const isPriceDefault = price[0] <= 0 && price[1] >= init.maxCap;

  const priceLabel = useMemo(() => {
    if (isPriceDefault) return "Price";
    if (price[0] <= 0) return `≤ ${formatIQD(price[1])}`;
    if (price[1] >= init.maxCap) return `≥ ${formatIQD(price[0])}`;
    return `${formatIQD(price[0])} – ${formatIQD(price[1])}`;
  }, [price, init.maxCap, isPriceDefault]);

  const apply = () => {
    const base: ProductsFilterValues = {
      ...(initialValues ?? DEFAULT_FILTER_VALUES),
      condition: (condition as any) || "",
      location: location || "",
      minPrice: isPriceDefault ? "" : String(price[0] ?? ""),
      maxPrice: isPriceDefault ? "" : String(price[1] ?? ""),
      sort: (sort as any) || "newest",
      // remove postedWithin to keep UI minimal
      postedWithin: "any",
    };
    const params = createProductsSearchParams(base);
    const query = params.toString();
    router.push(`${targetPath}${query ? `?${query}` : ""}`);
  };

  const reset = () => {
    setCondition("");
    setLocation("");
    setSort("newest");
    setPrice([0, init.maxCap]);
    const params = createProductsSearchParams({
      ...(initialValues ?? DEFAULT_FILTER_VALUES),
      condition: "",
      location: "",
      minPrice: "",
      maxPrice: "",
      sort: "newest",
      postedWithin: "any",
    });
    const q = params.toString();
    router.push(`${targetPath}${q ? `?${q}` : ""}`);
  };

  return (
    <div className="rounded-xl border bg-background px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* Condition */}
        <Select value={condition} onValueChange={(v) => setCondition(v)}>
          <SelectTrigger className="h-9 w-[130px] rounded-full text-sm">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="">Condition</SelectItem>
            {CONDITION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "all"} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* City */}
        <Select value={location} onValueChange={(v) => setLocation(v)}>
          <SelectTrigger className="h-9 w-[120px] rounded-full text-sm">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="">City</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Price slider in a compact popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 rounded-full px-3 text-sm">
              {priceLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Price range</span>
                <span className="font-medium">{priceLabel}</span>
              </div>
              <div className="px-1 py-2">
                <SliderPrimitive.Root
                  value={price as unknown as number[]}
                  onValueChange={(val) => setPrice([val[0], val[1]] as [number, number])}
                  min={0}
                  max={init.maxCap}
                  step={1000}
                  className={cn("relative flex w-full touch-none select-none items-center")}
                >
                  <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                    <SliderPrimitive.Range className="absolute h-full bg-primary" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                  <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                </SliderPrimitive.Root>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPrice([0, init.maxCap])}>Reset</Button>
                <Button size="sm" onClick={apply}>Apply</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select value={sort} onValueChange={(v) => setSort(v)}>
          <SelectTrigger className="h-9 w-[140px] rounded-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price_asc">Price: Low to High</SelectItem>
            <SelectItem value="price_desc">Price: High to Low</SelectItem>
            <SelectItem value="views_desc">Most Viewed</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" className="rounded-full" onClick={apply}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProductsFilterBar;

