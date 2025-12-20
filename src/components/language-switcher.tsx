'use client'

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Locale } from '@/lib/locale/dictionary';
import { useLocale } from '@/providers/locale-provider';
import { Check, Globe } from 'lucide-react';

const SUPPORTED_LANGUAGES: Locale[] = ['en', 'ar', 'ku'];
const LANGUAGE_BADGES: Record<Locale, string> = {
  en: 'ENG',
  ar: 'ARA',
  ku: 'KUR',
};

export default function LanguageSwitcher() {
  const { locale, setLocale, messages, t } = useLocale();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== 'language-switcher') {
        setOpen(false);
      }
    };
    window.addEventListener('ku-menu-open', handler);
    return () => window.removeEventListener('ku-menu-open', handler);
  }, []);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ku-menu-open', { detail: { source: 'language-switcher' } }));
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="inline-flex items-center gap-2 rounded-full border border-[#d6d6d6]/80 bg-gradient-to-b from-[#fbfbfb] to-[#f1f1f1] px-3.5 py-1.5 text-sm font-medium text-[#1F1C1C] shadow-sm transition hover:border-[#E67E22]/50 hover:text-[#E67E22] hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:ring-2 focus-visible:ring-[#E67E22]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40"
        >
          <Globe className="h-[19px] w-[19px]" strokeWidth={1.6} aria-hidden="true" />
          <span className="text-sm font-medium tracking-wide">{LANGUAGE_BADGES[locale]}</span>
          <span className="sr-only">{t('header.languageLabel')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="z-[90] w-44 rounded-3xl border border-white/50 bg-gradient-to-br from-white/85 via-white/70 to-primary/10 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-2xl ring-1 ring-white/40"
      >
        <DropdownMenuLabel>{t('header.languageLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => setLocale(code)}
            className="flex items-center justify-between gap-4"
          >
            <span>{messages.languageNames[code]}</span>
            {locale === code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
