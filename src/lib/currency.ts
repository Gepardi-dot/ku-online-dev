export const CURRENCY_VALUES = ["IQD", "USD"] as const;

export type CurrencyCode = (typeof CURRENCY_VALUES)[number];
