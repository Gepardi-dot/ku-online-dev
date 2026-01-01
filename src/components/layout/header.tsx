'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Camera, Search, Filter, PackagePlus } from 'lucide-react';
import { Icons } from '@/components/icons';
import BrandLogo from '@/components/brand-logo';
import LanguageSwitcher from '@/components/language-switcher';
import AuthButton from '@/components/auth/auth-button';
import type { User } from '@supabase/supabase-js';
import { useLocale } from '@/providers/locale-provider';
import NotificationMenu from './notification-menu';
import MessagesMenu from './messages-menu';
import FavoritesMenu from './favorites-menu';

interface AppHeaderProps {
  user?: User | null;
}

const CITY_KEYS = ['all', 'erbil', 'sulaymaniyah', 'duhok', 'zaxo'] as const;
type CityKey = (typeof CITY_KEYS)[number];

export default function AppHeader({ user }: AppHeaderProps) {
  const { t, messages } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [city, setCity] = useState<CityKey>('all');
  const [desktopCityOpen, setDesktopCityOpen] = useState(false);
  const [mobileCityOpen, setMobileCityOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!searchParams) {
      return;
    }

    const currentSearch = searchParams.get('search') ?? '';
    const currentCity = (searchParams.get('location') ?? 'all') as CityKey;
    setSearchTerm(currentSearch);
    setCity(CITY_KEYS.includes(currentCity) ? currentCity : 'all');
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== 'header-city-desktop' && detail?.source !== 'header-city-mobile') {
        setDesktopCityOpen(false);
        setMobileCityOpen(false);
      }
    };
    window.addEventListener('ku-menu-open', handler);
    return () => window.removeEventListener('ku-menu-open', handler);
  }, []);

  const updateQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      Object.entries(updates).forEach(([key, value]) => {
        if (value && value.length > 0) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      const query = params.toString();
      return query ? `?${query}` : '';
    },
    [searchParams],
  );

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const query = updateQueryString({
        search: searchTerm.trim() ? searchTerm.trim() : null,
        location: city !== 'all' ? city : null,
      });
      router.push(`/products${query}`);
    },
    [updateQueryString, searchTerm, city, router],
  );

  const handleCitySelection = useCallback(
    (value: string) => {
      const normalized = (CITY_KEYS.find((item) => item === value) ?? 'all') as CityKey;
      setCity(normalized);
      const query = updateQueryString({
        location: normalized !== 'all' ? normalized : null,
      });
      router.push(`/products${query}`);
    },
    [updateQueryString, router],
  );

  const currentCityLabel = useMemo(() => {
    const cityMap = messages.header.city;
    return cityMap[city] ?? cityMap.all;
  }, [city, messages.header.city]);

  const handleImageSearchClick = () => {
    if (imageInputRef.current) {
      imageInputRef.current.click();
    }
  };

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.alert(`${messages.common.comingSoonTitle}\n\n${messages.common.comingSoonDescription}`);
    }

    event.target.value = '';
  };

  return (
    <header
      id="ku-main-header"
      dir="ltr"
      className="sticky top-0 z-60 w-full bg-white/80 shadow-sm backdrop-blur-md pointer-events-auto"
    >
      <div className="container mx-auto px-4">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageInputChange}
        />
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile / small-screen logo (original behavior) */}
            <Link
              href="/"
              className="group relative flex h-16 w-16 items-center justify-center md:hidden"
              aria-label="KU-ONLINE home"
            >
              <BrandLogo
                className="h-16 w-16 overflow-visible transform scale-[2.95] translate-y-[20px] transition-transform duration-200 group-hover:scale-[3.0] group-hover:translate-y-[18px] pointer-events-none"
                size={64}
              />
            </Link>
          </div>

          {/* Desktop: logo inline with search bar */}
          <div className="hidden md:flex flex-1 max-w-4xl mx-4 items-center gap-4">
            <Link
              href="/"
              aria-label="KU-ONLINE home"
              className="group flex h-14 w-14 items-center justify-center"
            >
              <BrandLogo
                className="h-14 w-14 overflow-visible transform scale-[2.55] translate-y-[8px] transition-transform duration-200 group-hover:scale-[2.61] group-hover:translate-y-[10px] pointer-events-none"
                size={56}
              />
            </Link>

            <form className="flex-1" onSubmit={handleSearchSubmit}>
              <div className="relative w-full">
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t('header.searchPlaceholder')}
                  aria-label={t('header.searchPlaceholder')}
                  className="h-11 w-full rounded-full border-gray-300 pr-60 focus:border-primary focus:ring-primary focus:ring-2"
                />
                <div className="absolute right-0 top-0 flex h-full items-center gap-2 pr-1.5">
                  <DropdownMenu
                    open={desktopCityOpen}
                    onOpenChange={(next) => {
                      setDesktopCityOpen(next);
                      if (next) {
                        setMobileCityOpen(false);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(
                            new CustomEvent('ku-menu-open', { detail: { source: 'header-city-desktop' } }),
                          );
                        }
                      }
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-9 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-800 transition active:scale-[0.98] data-[state=open]:scale-[1.02] data-[state=open]:border-brand/60 data-[state=open]:bg-white/90 data-[state=open]:shadow-[0_12px_28px_rgba(247,111,29,0.16)]"
                      >
                        <Filter className="h-4.5 w-4.5 mr-2" aria-hidden="true" />
                        <span className="truncate max-w-30">{currentCityLabel}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-56 rounded-[32px] border border-white/60 bg-linear-to-br from-white/30 via-white/20 to-white/5 bg-transparent! p-3 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40"
                      align="end"
                    >
                      <DropdownMenuLabel>{t('header.filterLabel')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup value={city} onValueChange={handleCitySelection}>
                        {CITY_KEYS.map((item) => (
                          <DropdownMenuRadioItem key={item} value={item}>
                            {messages.header.city[item]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-10 rounded-full bg-secondary text-gray-800"
                    aria-label={t('header.searchByImage')}
                    onClick={handleImageSearchClick}
                  >
                    <Camera className="h-5 w-5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="submit"
                    className="h-9 w-12 rounded-full bg-primary hover:bg-accent-foreground"
                    aria-label={t('header.searchButton')}
                  >
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </form>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {user && (
              <>
                {/* Hide Favorites on mobile; available in bottom nav */}
                <div className="hidden md:block">
                  <FavoritesMenu
                    userId={user.id}
                    strings={{
                      label: messages.header.favorites,
                      empty: messages.header.favoritesEmpty,
                      loginRequired: messages.header.loginRequired,
                    }}
                  />
                </div>
                <NotificationMenu
                  userId={user.id}
                  strings={{
                    label: t('header.notifications'),
                    empty: messages.header.notificationsEmpty,
                    markAll: messages.header.markAllRead,
                    loginRequired: messages.header.loginRequired,
                  }}
                />
                {/* Hide Messages on mobile; available in bottom nav */}
                <div className="hidden md:block">
                  <MessagesMenu
                    userId={user.id}
                    strings={{
                      label: t('header.messages'),
                      empty: messages.header.messagesEmpty,
                      loginRequired: messages.header.loginRequired,
                      typePlaceholder: messages.header.typeMessage,
                      send: messages.header.sendMessage,
                    }}
                  />
                </div>
                {/* Hide Create Listing on mobile; use bottom nav SELL */}
                <Button asChild className="hidden md:inline-flex">
                  <Link href="/sell">
                    <PackagePlus className="mr-2 h-5 w-5" aria-hidden="true" />
                    {t('header.createListing')}
                  </Link>
                </Button>
              </>
            )}
            <LanguageSwitcher />
            <AuthButton user={user ?? null} />
          </div>
        </div>

        <div className="mt-2 pb-3 md:hidden">
          <form className="flex gap-2" onSubmit={handleSearchSubmit}>
            <div className="relative flex-1">
              <Input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('header.searchMobilePlaceholder')}
                aria-label={t('header.searchMobilePlaceholder')}
                className="w-full rounded-full border-gray-300 pr-20 focus:border-primary"
              />
              <button
                type="button"
                className="absolute right-9 top-1/2 -translate-y-1/2 text-gray-400"
                aria-label={t('header.searchByImage')}
                onClick={handleImageSearchClick}
              >
                <Camera className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-label={t('header.searchButton')}
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <DropdownMenu
              open={mobileCityOpen}
              onOpenChange={(next) => {
                setMobileCityOpen(next);
                if (next) {
                  setDesktopCityOpen(false);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('ku-menu-open', { detail: { source: 'header-city-mobile' } }),
                    );
                  }
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full px-2.5 flex items-center gap-1 min-w-[78px] justify-center transition active:scale-[0.98] data-[state=open]:scale-[1.02] data-[state=open]:border-brand/60 data-[state=open]:bg-white/90 data-[state=open]:shadow-[0_12px_28px_rgba(247,111,29,0.16)]"
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm font-semibold truncate">{currentCityLabel}</span>
                  <span className="sr-only">{t('header.filterLabel')}</span>
                </Button>
              </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-56 rounded-[32px] border border-white/60 bg-linear-to-br from-white/30 via-white/20 to-white/5 bg-transparent! p-3 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40"
                      align="end"
                    >
                <DropdownMenuLabel>{t('header.filterLabel')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={city} onValueChange={handleCitySelection}>
                  {CITY_KEYS.map((item) => (
                    <DropdownMenuRadioItem key={item} value={item}>
                      {messages.header.city[item]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </form>
        </div>
      </div>
    </header>
  );
}
