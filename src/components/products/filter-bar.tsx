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
import { COLOR_OPTIONS, type ColorToken } from "@/data/colors";
import { Check } from 'lucide-react';
import { useLocale } from "@/providers/locale-provider";
import { rtlLocales } from "@/lib/locale/dictionary";

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

const CLEAR_VALUE = "__ALL__";

export function ProductsFilterBar({
  locations,
  initialValues,
  targetPath = "/products",
  showCategorySelect = false, // API compatibility
}: ProductsFilterBarProps) {
  const router = useRouter();
  const { t, messages, locale } = useLocale();
  const direction = rtlLocales.includes(locale) ? "rtl" : "ltr";
  const contentAlign = direction === "rtl" ? "end" : "start";
  const init = useInitialState(initialValues);

  const [condition, setCondition] = useState<string>(init.condition || "");
  const [location, setLocation] = useState<string>(init.location || "");
  const [sort, setSort] = useState<string>(init.sort || "newest");
  const [price, setPrice] = useState<[number, number]>([
    init.minPrice ?? 0,
    init.maxPrice ?? init.maxCap,
  ]);
  const [priceOpen, setPriceOpen] = useState(false);
  const [color, setColor] = useState<string>(initialValues?.color ?? "");
  const [colorOpen, setColorOpen] = useState(false);

  const isPriceDefault = price[0] <= 0 && price[1] >= init.maxCap;

  const conditionLabels: Record<string, string> = {
    'new': t("filters.conditionNew"),
    'used - like new': t("filters.conditionLikeNew"),
    'used - good': t("filters.conditionGood"),
    'used - fair': t("filters.conditionFair"),
  };

  const getConditionLabel = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return conditionLabels[normalized] ?? value;
  };

  const cityLabels = messages.header.city;
  const getCityLabel = (city: string) =>
    cityLabels[city.toLowerCase() as keyof typeof cityLabels] ?? city;

  // Chip label stays compact and neutral across locales
  const priceChipLabel = t("filters.priceTag");
  const priceDetailLabel = useMemo(() => {
    if (isPriceDefault) return messages.filters.allPrices;
    if (price[0] <= 0) {
      return messages.filters.upTo.replace("{amount}", formatIQD(price[1]));
    }
    if (price[1] >= init.maxCap) {
      return messages.filters.from.replace("{amount}", formatIQD(price[0]));
    }
    return messages.filters.between
      .replace("{from}", formatIQD(price[0]))
      .replace("{to}", formatIQD(price[1]));
  }, [isPriceDefault, messages.filters, price, init.maxCap]);

  const apply = () => {
    // Close any open popovers so UI doesn't linger after navigation
    setPriceOpen(false);
    setColorOpen(false);
    const base: ProductsFilterValues = {
      ...(initialValues ?? DEFAULT_FILTER_VALUES),
      condition: (condition as any) || "",
      location: location || "",
      color: color || "",
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
    setPriceOpen(false);
    setColorOpen(false);
    setCondition("");
    setLocation("");
    setSort("newest");
    setPrice([0, init.maxCap]);
    setColor("");
    const params = createProductsSearchParams({
      ...(initialValues ?? DEFAULT_FILTER_VALUES),
      condition: "",
      location: "",
      color: "",
      minPrice: "",
      maxPrice: "",
      sort: "newest",
      postedWithin: "any",
    });
    const q = params.toString();
    router.push(`${targetPath}${q ? `?${q}` : ""}`);
  };

  // Map empty selections to a non-empty sentinel value for Radix Select
  const conditionUiValue = condition === "" ? CLEAR_VALUE : condition;
  const locationUiValue = location === "" ? CLEAR_VALUE : location;

  const filterBarClassName =
    "w-full rounded-2xl border border-white/50 bg-white/60 px-3 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl md:mx-auto md:w-fit";

  const framedControlClassName =
    "rounded-xl border border-slate-200/90 bg-white/80 shadow-[0_6px_18px_rgba(15,23,42,0.10)] ring-1 ring-black/5 backdrop-blur-xl " +
    "transition-all duration-200 ease-out will-change-transform " +
    "hover:border-slate-300/90 hover:bg-white/90 hover:shadow-[0_8px_22px_rgba(15,23,42,0.12)] " +
    "data-[state=open]:-translate-y-0.5 md:data-[state=open]:translate-y-0 data-[state=open]:border-primary/40 data-[state=open]:bg-white/95 " +
    "data-[state=open]:shadow-[0_16px_40px_rgba(249,115,22,0.22)] data-[state=open]:ring-2 data-[state=open]:ring-primary/30 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80";

  const selectTriggerClassName =
    "h-10 w-fit max-w-full px-3.5 text-[15px] " + framedControlClassName;

  const chipTriggerClassName =
    "inline-flex h-9 w-fit shrink-0 items-center gap-2 px-3.5 text-sm " + framedControlClassName;

  const selectContentClassName =
    "max-h-[18rem] w-fit min-w-[var(--radix-select-trigger-width)] max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[#d6d6d6]/70 bg-white/90 p-1 " +
    "shadow-[0_18px_48px_rgba(15,23,42,0.18)] ring-1 ring-white/40 backdrop-blur-xl " +
    "[&_[data-radix-select-viewport]]:!w-auto [&_[data-radix-select-viewport]]:!min-w-[var(--radix-select-trigger-width)] [&_[data-radix-select-viewport]]:p-1 " +
    "[&_[data-radix-select-viewport]]:flex [&_[data-radix-select-viewport]]:flex-col [&_[data-radix-select-viewport]]:gap-1";

  const selectItemClassName =
    "w-full truncate rounded-xl border border-slate-200/70 bg-white px-3 py-2 ps-10 text-[15px] text-[#1F1C1C] shadow-sm outline-none transition " +
    "hover:border-slate-300/70 hover:bg-slate-50/80 data-[highlighted]:border-slate-300/70 data-[highlighted]:bg-slate-50/80 " +
    "data-[state=checked]:border-primary/25 data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium";

  const popoverContentClassName =
    "w-[min(92vw,22rem)] rounded-2xl border border-white/45 bg-white/35 p-3 " +
    "shadow-[0_30px_95px_rgba(15,23,42,0.2)] ring-1 ring-white/20 backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-110";

  return (
    <div
      dir={direction}
      className={filterBarClassName}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Condition */}
        <Select
          dir={direction}
          value={conditionUiValue}
          onValueChange={(v) => setCondition(v === CLEAR_VALUE ? "" : v)}
        >
          <SelectTrigger className={selectTriggerClassName}>
            <SelectValue placeholder={t("filters.condition")} />
          </SelectTrigger>
          <SelectContent align={contentAlign} dir={direction} className={selectContentClassName}>
            <SelectItem value={CLEAR_VALUE} className={selectItemClassName}>
              {t("filters.conditionAll")}
            </SelectItem>
            {CONDITION_OPTIONS.filter((opt) => opt.value !== "").map((opt) => (
              <SelectItem key={opt.value || "all"} value={opt.value || CLEAR_VALUE} className={selectItemClassName}>
                {getConditionLabel(opt.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* City */}
        <Select
          dir={direction}
          value={locationUiValue}
          onValueChange={(v) => setLocation(v === CLEAR_VALUE ? "" : v)}
        >
          <SelectTrigger className={selectTriggerClassName}>
            <SelectValue placeholder={t("filters.city")} />
          </SelectTrigger>
          <SelectContent align={contentAlign} dir={direction} className={selectContentClassName}>
            <SelectItem value={CLEAR_VALUE} className={selectItemClassName}>
              {t("filters.cityAll")}
            </SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc} className={selectItemClassName}>
                {getCityLabel(loc)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Color */}
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={chipTriggerClassName}
            >
              {color && (
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full border shadow-sm"
                  style={{ backgroundColor: COLOR_OPTIONS.find((c) => c.token === (color as ColorToken))?.hex || '#fff' }}
                  aria-hidden="true"
                />
              )}
              {t("filters.color")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className={popoverContentClassName} align={contentAlign} dir={direction}>
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 p-1">
              {/* All colors */}
              <button
                type="button"
                title={messages.filters.allColors}
                aria-label={messages.filters.allColors}
                className={
                  'group relative h-9 w-9 rounded-md border bg-[conic-gradient(at_60%_40%,#000,#fff,#E53935,#1E90FF,#43A047,#D4AF37,#7F00FF,#40E0D0)] shadow-sm hover:opacity-95 transition transform hover:scale-105 active:scale-95 ' +
                  (color === '' ? 'ring-2 ring-primary' : '')
                }
                onClick={() => { setColor(''); setColorOpen(false); }}
              >
                <span className="absolute inset-0 rounded-md bg-white/0 group-hover:bg-white/5 transition" />
                {color === '' && (
                  <Check className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground p-0.5" />
                )}
                <span className="sr-only">{messages.filters.allColors}</span>
              </button>
              {(
                [
                  'orange','black','white','blue','yellow','red','green','pink','brown','turquoise','violet','gray','gold','silver','beige',
                ] as const
              ).map((token) => {
                const opt = COLOR_OPTIONS.find((c) => c.token === token as any) ||
                  (token === 'turquoise' ? { token: 'turquoise', hex: '#40E0D0', label: 'Turquoise' } :
                   token === 'violet' ? { token: 'violet', hex: '#7F00FF', label: 'Violet' } : undefined);
                if (!opt) return null;
                return (
                <button
                  key={opt.token}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  className={
                    'group relative h-9 w-9 rounded-md border shadow-sm transition transform hover:scale-105 active:scale-95 ' +
                    (color === opt.token ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-muted-foreground/20')
                  }
                  style={{ backgroundColor: opt.hex }}
                  onClick={() => { setColor(opt.token); setColorOpen(false); }}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-br from-white/25 to-black/10 mix-blend-overlay opacity-40 group-hover:opacity-50 transition" />
                  {color === opt.token && (
                    <Check className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground p-0.5" />
                  )}
                  <span className="sr-only">{opt.label}</span>
                </button>
              );})}
            </div>
          </PopoverContent>
        </Popover>

        {/* Price slider in a compact popover */}
        <Popover open={priceOpen} onOpenChange={setPriceOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={chipTriggerClassName}
            >
              {priceChipLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className={cn(popoverContentClassName, "w-[min(90vw,20rem)]")} align={contentAlign} dir={direction}>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("filters.priceRange")}</span>
                <span className="font-medium">{priceDetailLabel}</span>
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
                <Button size="sm" variant="ghost" onClick={() => { setPrice([0, init.maxCap]); setPriceOpen(false); }}>
                  {t("filters.reset")}
                </Button>
                <Button size="sm" onClick={() => { apply(); setPriceOpen(false); }}>
                  {t("filters.apply")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select dir={direction} value={sort} onValueChange={(v) => setSort(v)}>
          <SelectTrigger className={selectTriggerClassName}>
            <SelectValue placeholder={t("filters.sortNewest")} />
          </SelectTrigger>
          <SelectContent align={contentAlign} dir={direction} className={selectContentClassName}>
            <SelectItem value="newest" className={selectItemClassName}>{t("filters.sortNewest")}</SelectItem>
            <SelectItem value="price_asc" className={selectItemClassName}>{t("filters.sortPriceAsc")}</SelectItem>
            <SelectItem value="price_desc" className={selectItemClassName}>{t("filters.sortPriceDesc")}</SelectItem>
            <SelectItem value="views_desc" className={selectItemClassName}>{t("filters.sortMostViewed")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-9 text-sm px-4 rounded-full" onClick={apply}>
            {t("filters.apply")}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 text-sm px-3 rounded-full" onClick={reset}>
            {t("filters.reset")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProductsFilterBar;
