import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { Locale } from '@/lib/locale/dictionary';
import { formatCurrency } from '@/lib/locale/formatting';
import { cn } from '@/lib/utils';

export type CurrencyTextProps = {
  amount: number | null | undefined;
  currencyCode: string | null | undefined;
  locale: Locale;
  usdClassName?: string;
  currencyLabelClassName?: string;
  currencyLabelTone?: 'light' | 'dark';
} & HTMLAttributes<HTMLSpanElement>;

export function highlightDollar(value: string, usdClassName = 'text-orange-500'): ReactNode {
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

export function CurrencyText({
  amount,
  currencyCode,
  locale,
  usdClassName,
  currencyLabelClassName,
  currencyLabelTone = 'dark',
  ...spanProps
}: CurrencyTextProps) {
  const formatted = formatCurrency(amount, currencyCode, locale);
  const code = (currencyCode ?? 'IQD').trim().toUpperCase();

  const labels = new Set<string>();
  if (code === 'USD') {
    labels.add('$');
    labels.add('USD');
  } else if (code === 'IQD') {
    labels.add('IQD');
    labels.add('د.ع');
  } else if (code) {
    labels.add(code);
  }

  const escapedLabels = Array.from(labels)
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!escapedLabels.length) {
    return <span {...spanProps}>{highlightDollar(formatted, usdClassName)}</span>;
  }

  const tokens = formatted.split(new RegExp(`(${escapedLabels.join('|')})`, 'g'));

  return (
    <span {...spanProps}>
      {tokens.map((token, index) => {
        const stripped = token.replace(/[\u200e\u200f\u061c]/g, '');
        if (!labels.has(stripped)) {
          return <Fragment key={`${index}-${token}`}>{token}</Fragment>;
        }

        return (
          <span
            key={`${index}-${token}`}
            className={cn(
              // Compact transparent canvas for currency labels across all locales.
              'mx-[0.12em] inline-flex items-center rounded-[0.45em] px-[0.34em] py-[0.03em] align-[0.08em] leading-none',
              currencyLabelTone === 'light'
                ? 'bg-white/[0.10] text-white ring-1 ring-white/35'
                : 'bg-black/[0.03] text-black ring-1 ring-black/10',
              stripped === '$' ? usdClassName : null,
              currencyLabelClassName,
            )}
          >
            {stripped}
          </span>
        );
      })}
    </span>
  );
}
