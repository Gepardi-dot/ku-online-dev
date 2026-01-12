export const MARKET_CITY_OPTIONS = [
  { value: "all", label: "All Cities" },
  { value: "erbil", label: "Erbil" },
  { value: "sulaymaniyah", label: "Sulaymaniyah" },
  { value: "duhok", label: "Duhok" },
  { value: "zaxo", label: "Zaxo" },
] as const;

export type MarketCityOption = (typeof MARKET_CITY_OPTIONS)[number];
export type MarketCityValue = MarketCityOption["value"];

const LABEL_BY_VALUE: Record<MarketCityValue, string> = MARKET_CITY_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<MarketCityValue, string>,
);

export const DEFAULT_MARKET_CITIES: MarketCityValue[] = MARKET_CITY_OPTIONS.filter(
  (option) => option.value !== "all",
).map((option) => option.value);

export function getMarketCityLabel(value: string | null | undefined): string {
  if (!value) {
    return LABEL_BY_VALUE.all;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "all cities") {
    return LABEL_BY_VALUE.all;
  }

  if (normalized in LABEL_BY_VALUE) {
    return LABEL_BY_VALUE[normalized as MarketCityValue];
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function normalizeMarketCityValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "all cities") {
    return "";
  }

  return normalized;
}

export function coerceMarketCitySelection(value: string | null | undefined): MarketCityValue {
  if (!value) {
    return "all";
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "all";
  }

  if (normalized in LABEL_BY_VALUE) {
    return normalized as MarketCityValue;
  }

  return "all";
}
