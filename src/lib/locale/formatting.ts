import type { Locale } from '@/lib/locale/dictionary';

export function getNumberLocale(locale: Locale): string {
  if (locale === 'ku') return 'ar-u-nu-arab';
  if (locale === 'ar') return 'ar-u-nu-arab';
  return 'en-US';
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
    return label ? formatted.replace(new RegExp(code, 'g'), label) : formatted;
  } catch {
    return `${amount} ${code}`;
  }
}
