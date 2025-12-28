import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { Locale } from '@/lib/locale/dictionary';
import { formatCurrency } from '@/lib/locale/formatting';

export type CurrencyTextProps = {
  amount: number | null | undefined;
  currencyCode: string | null | undefined;
  locale: Locale;
  usdClassName?: string;
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
  usdClassName = 'text-orange-500',
  ...spanProps
}: CurrencyTextProps) {
  const formatted = formatCurrency(amount, currencyCode, locale);
  return <span {...spanProps}>{highlightDollar(formatted, usdClassName)}</span>;
}
