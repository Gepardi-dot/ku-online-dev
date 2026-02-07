import type { Locale } from '@/lib/locale/dictionary';

export function getNumberLocale(locale: Locale): string {
  if (locale === 'ku') return 'ar-u-nu-arab';
  if (locale === 'ar') return 'ar-u-nu-arab';
  return 'en-US';
}

export function applyArabicComma(value: string, locale: Locale): string {
  if (locale !== 'ar' && locale !== 'ku') return value;
  // Replace Arabic thousands separator (U+066C) with Arabic comma (U+060C).
  return value.replace(/\u066C/g, '\u060C');
}

function getLocalizedCurrencyLabel(currencyCode: string, locale: Locale): string | null {
  if (currencyCode === 'USD') return '$';
  if (locale === 'ar') {
    if (currencyCode === 'IQD') return 'د.ع';
  }
  if (locale === 'ku') {
    if (currencyCode === 'IQD') return 'د.ع';
  }
  return null;
}

export function formatCurrency(
  amount: number | null | undefined,
  currencyCode: string | null | undefined,
  locale: Locale,
): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }

  const code = currencyCode ?? 'IQD';
  const numberLocale = getNumberLocale(locale);
  try {
    const formatted = new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(amount)
      .trim();
    const label = getLocalizedCurrencyLabel(code, locale);
    const localized = label ? formatted.replace(new RegExp(code, 'g'), label) : formatted;
    return applyArabicComma(localized, locale);
  } catch {
    return `${amount} ${code}`;
  }
}
