import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { Locale } from '@/lib/locale/dictionary';
import { formatCurrency } from '@/lib/locale/formatting';

export type CurrencyTextProps = {
  amount: number | null | undefined;
  currencyCode: string | null | undefined;
  locale: Locale;
  usdClassName?: string;
  currencyClassName?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function highlightDollar(value: string, usdClassName = 'text-black'): ReactNode {
  if (!value.includes('$')) {
    return value;
  }

  const parts = value.split('$');
  return parts.map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {part}
      {index < parts.length - 1 ? <span className={usdClassName}>$</span> : null}
    </Fragment>
  ));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightCurrencyLabels(
  value: string,
  labels: string[],
  className: string,
): ReactNode {
  const tokens = Array.from(new Set(labels.filter(Boolean)));
  if (!tokens.length) return value;
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'g');
  const parts = value.split(pattern);
  return parts.map((part, index) => {
    if (tokens.includes(part)) {
      return (
        <span key={`${index}-${part}`} className={className}>
          {part}
        </span>
      );
    }
    return <Fragment key={`${index}-${part}`}>{part}</Fragment>;
  });
}

export function CurrencyText({
  amount,
  currencyCode,
  locale,
  usdClassName = 'text-black',
  currencyClassName = 'text-black',
  ...spanProps
}: CurrencyTextProps) {
  const formatted = formatCurrency(amount, currencyCode, locale);
  const code = (currencyCode ?? '').trim().toUpperCase();
  const labels: string[] = [];
  if (code === 'USD') labels.push('$');
  if (code === 'IQD' && (locale === 'ar' || locale === 'ku')) labels.push('د.ع');
  if (code) labels.push(code);
  const baseLabelClassName =
    'inline-flex items-center rounded-md bg-black/0 px-1.5 py-0.5 text-[0.85em] leading-none ring-1 ring-black/10';
  const labelClassName = code === 'USD' ? usdClassName : currencyClassName;
  return (
    <span {...spanProps}>
      {highlightCurrencyLabels(formatted, labels, `${baseLabelClassName} ${labelClassName}`)}
    </span>
  );
}
