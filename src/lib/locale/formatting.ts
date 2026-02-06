import type { Locale } from '@/lib/locale/dictionary';

export function getNumberLocale(locale: Locale): string {
  if (locale === 'ku') return 'ar-u-nu-arab';
  if (locale === 'ar') return 'ar-u-nu-arab';
  return 'en-US';
}

export function applyArabicComma(value: string, locale: Locale): string {
  if (locale === 'ar' || locale === 'ku') {
    // Intl for Arabic locales often uses U+066C (٬) as the thousands separator.
    // The product requirement is to show the Arabic comma U+060C (،) instead.
    return value.replace(/[,\u066C]/g, '،');
  }
  return value;
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
    const label = getLocalizedCurrencyLabel(code, locale);
    if (label === 'د.ع' && (locale === 'ar' || locale === 'ku')) {
      const numeric = new Intl.NumberFormat(numberLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
      return `${applyArabicComma(numeric, locale)} ${label}`;
    }

    const formatted = new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(amount)
      .trim();
    const withLabel = label ? formatted.replace(new RegExp(code, 'g'), label) : formatted;
    return applyArabicComma(withLabel, locale);
  } catch {
    return `${amount} ${code}`;
  }
}
