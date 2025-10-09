import { cookies } from "next/headers";
import {
  defaultLocale,
  isLocale,
  Locale,
  translateFromDictionary,
} from "./dictionary";

export function getServerLocale(): Locale {
  const cookieLocale = cookies().get("ku_locale")?.value;
  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  return defaultLocale;
}

export function serverTranslate(locale: Locale, key: string): string {
  return translateFromDictionary(locale, key);
}
