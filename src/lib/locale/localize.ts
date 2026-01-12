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

// For user-generated listing content, avoid translating into English. When the UI locale is `en`,
// show the original text even if an English translation exists in the database.
export function localizeListingText(
  original: string | null | undefined,
  translations: LocalizedTextTranslations,
  locale: Locale,
): string {
  if (locale === 'en') {
    return typeof original === 'string' ? original : '';
  }

  return localizeText(original, translations, locale);
}
