import type { Locale } from '@/lib/locale/dictionary';

export type LocalizedTextTranslations = Record<string, string> | null | undefined;

export function localizeText(
  original: string | null | undefined,
  translations: LocalizedTextTranslations,
  locale: Locale,
): string {
  const translated = translations?.[locale];
  if (typeof translated === 'string' && translated.trim().length > 0) {
    return translated;
  }

  return typeof original === 'string' ? original : '';
}

