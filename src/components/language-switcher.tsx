'use client'

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="inline-flex items-center gap-2 rounded-full border border-[#E4E4E4] bg-white px-3.5 py-1.5 text-sm font-medium text-[#1F1C1C] hover:border-[#E67E22] hover:text-[#E67E22] focus-visible:ring-2 focus-visible:ring-[#E67E22]/40 focus-visible:ring-offset-2"
        >
          <Globe className="h-[19px] w-[19px]" strokeWidth={1.6} aria-hidden="true" />
          <span className="text-sm font-medium tracking-wide">{LANGUAGE_BADGES[locale]}</span>
          <span className="sr-only">{t('header.languageLabel')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
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
