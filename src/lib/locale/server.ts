import { cookies } from "next/headers";
import {
  defaultLocale,
  isLocale,
  Locale,
  translateFromDictionary,
} from "./dictionary";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("ku_locale")?.value;
  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  return defaultLocale;
}

export function serverTranslate(locale: Locale, key: string): string {
  return translateFromDictionary(locale, key);
}
