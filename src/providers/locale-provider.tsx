"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  defaultLocale,
  Locale,
  LocaleMessages,
  rtlLocales,
  translations,
  translateFromDictionary,
  isLocale,
} from "@/lib/locale/dictionary";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  messages: LocaleMessages;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const fallbackLocaleContext: LocaleContextValue = {
  locale: defaultLocale,
  setLocale: () => {},
  t: (key: string) => translateFromDictionary(defaultLocale, key),
  messages: translations[defaultLocale],
};

function applyDocumentLocale(nextLocale: Locale) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = nextLocale;
  document.documentElement.dir = rtlLocales.includes(nextLocale) ? "rtl" : "ltr";
}

type LocaleProviderProps = {
  children: React.ReactNode;
  initialLocale?: Locale;
};

export function LocaleProvider({ children, initialLocale = defaultLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("ku_locale");
    if (isLocale(stored)) {
      setLocaleState(stored);
      applyDocumentLocale(stored);
      return;
    }

    const htmlLang = document.documentElement.lang;
    if (isLocale(htmlLang)) {
      setLocaleState(htmlLang);
      applyDocumentLocale(htmlLang);
    }
  }, []);

  const persistLocale = useCallback((nextLocale: Locale) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ku_locale", nextLocale);
    }
    if (typeof document !== "undefined") {
      document.cookie = `ku_locale=${nextLocale}; path=/; max-age=31536000`;
    }
    applyDocumentLocale(nextLocale);
  }, []);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      if (nextLocale === locale) {
        return;
      }
      setLocaleState(nextLocale);
    },
    [locale],
  );

  useEffect(() => {
    persistLocale(locale);
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    router.refresh();
  }, [locale, persistLocale, router]);

  const messages = translations[locale];

  const t = useCallback(
    (key: string) => translateFromDictionary(locale, key),
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      messages,
    }),
    [locale, setLocale, t, messages],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (context) {
    return context;
  }

  return fallbackLocaleContext;
}
