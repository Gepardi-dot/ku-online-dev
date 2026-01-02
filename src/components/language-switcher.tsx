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

const SUPPORTED_LANGUAGES: Locale[] = ['en', 'ku', 'ar'];
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
          className="inline-flex items-center gap-2 rounded-full border border-[#d6d6d6]/80 bg-linear-to-b from-[#fbfbfb] to-[#f1f1f1] px-3.5 py-1.5 text-sm font-medium text-[#1F1C1C] shadow-sm transition hover:border-brand/50 hover:text-brand hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40 active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:border-brand/60 data-[state=open]:bg-white/90 data-[state=open]:shadow-[0_16px_38px_rgba(247,111,29,0.18)]"
        >
          <Globe className="h-[19px] w-[19px]" strokeWidth={1.6} aria-hidden="true" />
          <span className="text-sm font-medium tracking-wide">{LANGUAGE_BADGES[locale]}</span>
          <span className="sr-only">{t('header.languageLabel')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="z-90 w-48 rounded-[32px] border border-white/60 bg-linear-to-br from-white/30 via-white/20 to-white/5 bg-transparent! p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40"
      >
        <div className="px-3 py-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-brand">{t('header.languageLabel')}</span>
        </div>
        {SUPPORTED_LANGUAGES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => setLocale(code)}
            className="flex items-center justify-between gap-4 rounded-2xl border border-transparent bg-white/50 shadow-sm ring-1 ring-black/3 px-3 py-2 mb-2 last:mb-0 hover:bg-white/60 hover:border-[#eadbc5]/50 cursor-pointer"
          >
            <span>{messages.languageNames[code]}</span>
            {locale === code && <Check className="h-4 w-4 text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
