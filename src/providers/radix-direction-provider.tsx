'use client';

import type { ReactNode } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';

import { rtlLocales } from '@/lib/locale/dictionary';
import { useLocale } from '@/providers/locale-provider';

export function RadixDirectionProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const dir = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

