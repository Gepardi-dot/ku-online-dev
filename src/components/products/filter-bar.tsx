"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONDITION_OPTIONS,
  DEFAULT_FILTER_VALUES,
  type ProductsFilterValues,
  createProductsSearchParams,
} from "@/lib/products/filter-params";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollHintList } from "@/components/ui/scroll-hint-list";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { COLOR_OPTIONS, type ColorToken } from "@/data/colors";
import { Check, ChevronDown } from 'lucide-react';
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
    if (typeof s !== "string") return undefined;
    const trimmed = s.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
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
  const handlePopoverAutoFocus = useCallback((event: Event) => {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      event.preventDefault();
    }
  }, []);
  const handleTriggerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") {
        event.preventDefault();
      }
    },
    []
  );

  const [condition, setCondition] = useState<string>(init.condition || "");
  const [location, setLocation] = useState<string>(init.location || "");
  const [sort, setSort] = useState<string>(init.sort || "newest");
  const [conditionOpen, setConditionOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [price, setPrice] = useState<[number, number]>([
    init.minPrice ?? 0,
    init.maxPrice ?? init.maxCap,
  ]);
  const [priceOpen, setPriceOpen] = useState(false);
  const [color, setColor] = useState<string>(initialValues?.color ?? "");
  const [colorOpen, setColorOpen] = useState(false);
  const anyMenuOpen = conditionOpen || locationOpen || colorOpen || priceOpen || sortOpen;

  useEffect(() => {
    setCondition(init.condition || "");
    setLocation(init.location || "");
    setSort(init.sort || "newest");
    setPrice([init.minPrice ?? 0, init.maxPrice ?? init.maxCap]);
    setColor(initialValues?.color ?? "");
    setConditionOpen(false);
    setLocationOpen(false);
    setSortOpen(false);
    setPriceOpen(false);
    setColorOpen(false);
  }, [
    init.condition,
    init.location,
    init.sort,
    init.minPrice,
    init.maxPrice,
    init.maxCap,
    initialValues?.color,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ku-popover-state", { detail: { open: anyMenuOpen } }));
  }, [anyMenuOpen]);

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
  const priceTriggerLabel = isPriceDefault ? priceChipLabel : priceDetailLabel;

  const apply = () => {
    // Close any open popovers so UI doesn't linger after navigation
    setConditionOpen(false);
    setLocationOpen(false);
    setSortOpen(false);
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
    setConditionOpen(false);
    setLocationOpen(false);
    setSortOpen(false);
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

  // Map empty selections to a non-empty sentinel value for filter menus
  const conditionUiValue = condition === "" ? CLEAR_VALUE : condition;
  const locationUiValue = location === "" ? CLEAR_VALUE : location;

  const currentConditionLabel =
    conditionUiValue === CLEAR_VALUE ? t("filters.conditionAll") : getConditionLabel(condition);
  const currentCityLabel =
    locationUiValue === CLEAR_VALUE ? t("filters.cityAll") : getCityLabel(location);
  const currentSortLabel = (() => {
    if (sort === "price_asc") return t("filters.sortPriceAsc");
    if (sort === "price_desc") return t("filters.sortPriceDesc");
    if (sort === "views_desc") return t("filters.sortMostViewed");
    return t("filters.sortNewest");
  })();

  const filterBarClassName =
    "w-full rounded-2xl border border-white/50 bg-white/60 px-3 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl md:mx-auto md:w-fit";

  const framedControlClassName =
    "rounded-xl border border-slate-200/90 bg-white/80 shadow-[0_6px_18px_rgba(15,23,42,0.10)] ring-1 ring-black/5 backdrop-blur-xl " +
    "transition-all duration-200 ease-out will-change-transform " +
    "hover:border-slate-300/90 hover:bg-white/90 hover:shadow-[0_8px_22px_rgba(15,23,42,0.12)] " +
    "data-[state=open]:-translate-y-0.5 md:data-[state=open]:translate-y-0 data-[state=open]:border-primary/40 data-[state=open]:bg-white/95 " +
    "data-[state=open]:shadow-[0_16px_40px_rgba(249,115,22,0.22)] data-[state=open]:ring-2 data-[state=open]:ring-primary/30 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80";

  const chipTriggerClassName =
    "inline-flex h-9 w-fit shrink-0 items-center gap-2 px-3.5 text-sm font-medium " + framedControlClassName;

  const selectTriggerClassName = cn(
    "flex items-center justify-between",
    chipTriggerClassName,
    "!bg-none !bg-white/80 !border-slate-200/90"
  );

  const selectContentClassName =
    "max-h-[15rem] w-fit max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/45 bg-white/35 p-1 " +
    "shadow-[0_30px_95px_rgba(15,23,42,0.2)] ring-1 ring-white/20 backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-110 " +
    "!bg-none !bg-white/35 !border-white/45 " +
    "[&_[data-radix-select-viewport]]:!w-auto [&_[data-radix-select-viewport]]:!min-w-0";

  const selectItemClassName =
    "relative isolate mb-1 last:mb-0 block w-full truncate overflow-hidden rounded-lg border border-white/35 bg-slate-50/25 py-2 ps-3 pe-10 text-sm text-foreground origin-center " +
    "backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-110 " +
    "shadow-[0_14px_30px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(255,255,255,0.12)] " +
    "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:opacity-55 " +
    "before:bg-none " +
    "after:pointer-events-none after:absolute after:inset-0 after:z-0 after:opacity-60 after:bg-linear-to-b after:from-white/22 after:via-transparent after:to-transparent " +
    "motion-safe:transition-[transform,background-color,border-color,box-shadow] motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none " +
    "hover:bg-white/30 hover:border-primary/30 hover:shadow-[0_0_0_1px_rgba(249,115,22,0.25)] hover:scale-[1.01] focus:bg-white/22 focus:text-foreground " +
    "active:scale-[0.99] data-highlighted:scale-[0.99] data-highlighted:-translate-y-[1px] " +
    "data-highlighted:bg-primary/10 data-highlighted:border-primary/25 data-highlighted:shadow-[0_14px_26px_rgba(249,115,22,0.12)] " +
    "data-[state=checked]:bg-primary/10 data-[state=checked]:border-primary/30 data-[state=checked]:shadow-[0_14px_26px_rgba(249,115,22,0.14)]";

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
        <Popover
          open={conditionOpen}
          onOpenChange={(next) => {
            setConditionOpen(next);
            if (next) {
              setLocationOpen(false);
              setSortOpen(false);
              setPriceOpen(false);
              setColorOpen(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={selectTriggerClassName}
              aria-label={t("filters.condition")}
              onPointerDown={handleTriggerPointerDown}
            >
              <span className="truncate max-w-[10.5rem]">{currentConditionLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align={contentAlign}
            dir={direction}
            className={selectContentClassName}
            onOpenAutoFocus={handlePopoverAutoFocus}
            onCloseAutoFocus={handlePopoverAutoFocus}
          >
            <ScrollHintList scrollClassName="max-h-[15rem] overflow-auto overscroll-contain p-1">
              <button
                type="button"
                className={selectItemClassName}
                data-state={conditionUiValue === CLEAR_VALUE ? "checked" : "unchecked"}
                onClick={() => {
                  setCondition("");
                  setConditionOpen(false);
                }}
              >
                <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                  {conditionUiValue === CLEAR_VALUE ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                </span>
                {t("filters.conditionAll")}
              </button>
              {CONDITION_OPTIONS.filter((opt) => opt.value !== "").map((opt) => (
                <button
                  key={opt.value || "all"}
                  type="button"
                  className={selectItemClassName}
                  data-state={condition === opt.value ? "checked" : "unchecked"}
                  onClick={() => {
                    setCondition(opt.value);
                    setConditionOpen(false);
                  }}
                >
                  <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                    {condition === opt.value ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                  </span>
                  {getConditionLabel(opt.value)}
                </button>
              ))}
            </ScrollHintList>
          </PopoverContent>
        </Popover>

        {/* City */}
        <Popover
          open={locationOpen}
          onOpenChange={(next) => {
            setLocationOpen(next);
            if (next) {
              setConditionOpen(false);
              setSortOpen(false);
              setPriceOpen(false);
              setColorOpen(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={selectTriggerClassName}
              aria-label={t("filters.city")}
              onPointerDown={handleTriggerPointerDown}
            >
              <span className="truncate max-w-[10.5rem]">{currentCityLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align={contentAlign}
            dir={direction}
            className={selectContentClassName}
            onOpenAutoFocus={handlePopoverAutoFocus}
            onCloseAutoFocus={handlePopoverAutoFocus}
          >
            <ScrollHintList scrollClassName="max-h-[15rem] overflow-auto overscroll-contain p-1">
              <button
                type="button"
                className={selectItemClassName}
                data-state={locationUiValue === CLEAR_VALUE ? "checked" : "unchecked"}
                onClick={() => {
                  setLocation("");
                  setLocationOpen(false);
                }}
              >
                <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                  {locationUiValue === CLEAR_VALUE ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                </span>
                {t("filters.cityAll")}
              </button>
              {locations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={selectItemClassName}
                  data-state={location === loc ? "checked" : "unchecked"}
                  onClick={() => {
                    setLocation(loc);
                    setLocationOpen(false);
                  }}
                >
                  <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                    {location === loc ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                  </span>
                  {getCityLabel(loc)}
                </button>
              ))}
            </ScrollHintList>
          </PopoverContent>
        </Popover>

        {/* Color */}
        <Popover
          open={colorOpen}
          onOpenChange={(next) => {
            setColorOpen(next);
            if (next) {
              setConditionOpen(false);
              setLocationOpen(false);
              setSortOpen(false);
              setPriceOpen(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={chipTriggerClassName}
              onPointerDown={handleTriggerPointerDown}
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
          <PopoverContent
            className={popoverContentClassName}
            align={contentAlign}
            dir={direction}
            onOpenAutoFocus={handlePopoverAutoFocus}
            onCloseAutoFocus={handlePopoverAutoFocus}
          >
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
        <Popover
          open={priceOpen}
          onOpenChange={(next) => {
            setPriceOpen(next);
            if (next) {
              setConditionOpen(false);
              setLocationOpen(false);
              setSortOpen(false);
              setColorOpen(false);
            }
          }}
        >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={chipTriggerClassName}
            onPointerDown={handleTriggerPointerDown}
          >
              <span className="truncate max-w-[10.5rem]">{priceTriggerLabel}</span>
          </Button>
        </PopoverTrigger>
          <PopoverContent
            className={cn(popoverContentClassName, "w-[min(90vw,20rem)]")}
            align={contentAlign}
            dir={direction}
            onOpenAutoFocus={handlePopoverAutoFocus}
            onCloseAutoFocus={handlePopoverAutoFocus}
          >
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
        <Popover
          open={sortOpen}
          onOpenChange={(next) => {
            setSortOpen(next);
            if (next) {
              setConditionOpen(false);
              setLocationOpen(false);
              setPriceOpen(false);
              setColorOpen(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={selectTriggerClassName}
              aria-label={t("filters.sortNewest")}
              onPointerDown={handleTriggerPointerDown}
            >
              <span className="truncate max-w-[10.5rem]">{currentSortLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align={contentAlign}
            dir={direction}
            className={selectContentClassName}
            onOpenAutoFocus={handlePopoverAutoFocus}
            onCloseAutoFocus={handlePopoverAutoFocus}
          >
            <ScrollHintList scrollClassName="max-h-[15rem] overflow-auto overscroll-contain p-1">
              <button
                type="button"
                className={selectItemClassName}
                data-state={sort === "newest" ? "checked" : "unchecked"}
                onClick={() => {
                  setSort("newest");
                  setSortOpen(false);
                }}
              >
                <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                  {sort === "newest" ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                </span>
                {t("filters.sortNewest")}
              </button>
              <button
                type="button"
                className={selectItemClassName}
                data-state={sort === "price_asc" ? "checked" : "unchecked"}
                onClick={() => {
                  setSort("price_asc");
                  setSortOpen(false);
                }}
              >
                <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                  {sort === "price_asc" ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                </span>
                {t("filters.sortPriceAsc")}
              </button>
              <button
                type="button"
                className={selectItemClassName}
                data-state={sort === "price_desc" ? "checked" : "unchecked"}
                onClick={() => {
                  setSort("price_desc");
                  setSortOpen(false);
                }}
              >
                <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                  {sort === "price_desc" ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                </span>
                {t("filters.sortPriceDesc")}
              </button>
              <button
                type="button"
                className={selectItemClassName}
                data-state={sort === "views_desc" ? "checked" : "unchecked"}
                onClick={() => {
                  setSort("views_desc");
                  setSortOpen(false);
                }}
              >
                <span className="absolute end-3 flex h-4 w-4 items-center justify-center">
                  {sort === "views_desc" ? <Check className="h-4 w-4 text-[#E67E22]" /> : null}
                </span>
                {t("filters.sortMostViewed")}
              </button>
            </ScrollHintList>
          </PopoverContent>
        </Popover>

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
