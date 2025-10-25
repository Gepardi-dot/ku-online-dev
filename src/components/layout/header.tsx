'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
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
import { Search, Filter, PackagePlus } from 'lucide-react';
import { Icons } from '@/components/icons';
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

  useEffect(() => {
    if (!searchParams) {
      return;
    }

    const currentSearch = searchParams.get('search') ?? '';
    const currentCity = (searchParams.get('location') ?? 'all') as CityKey;
    setSearchTerm(currentSearch);
    setCity(CITY_KEYS.includes(currentCity) ? currentCity : 'all');
  }, [searchParams]);

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

  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 shadow-sm backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center" aria-label="KU-ONLINE home">
              <Icons.logo className="h-8 w-8" />
              <span className="ml-2 text-2xl font-bold font-headline text-primary">KU-ONLINE</span>
            </Link>
          </div>

          <form className="hidden md:flex flex-1 max-w-2xl mx-6" onSubmit={handleSearchSubmit}>
            <div className="relative w-full">
              <Input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('header.searchPlaceholder')}
                aria-label={t('header.searchPlaceholder')}
                className="w-full rounded-full border-gray-300 pr-44 focus:border-primary focus:ring-primary focus:ring-2"
              />
              <div className="absolute right-0 top-0 h-full flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="rounded-full h-full px-4 border-l">
                      <Filter className="h-5 w-5 mr-2" aria-hidden="true" />
                      <span className="truncate max-w-[7.5rem]">{currentCityLabel}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end">
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
                  type="submit"
                  className="h-full rounded-r-full px-5 bg-primary hover:bg-accent-foreground"
                  aria-label={t('header.searchButton')}
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </form>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {user && (
              <>
                <FavoritesMenu
                  userId={user.id}
                  strings={{
                    label: messages.header.favorites,
                    empty: messages.header.favoritesEmpty,
                    loginRequired: messages.header.loginRequired,
                  }}
                />
                <NotificationMenu
                  userId={user.id}
                  strings={{
                    label: t('header.notifications'),
                    empty: messages.header.notificationsEmpty,
                    markAll: messages.header.markAllRead,
                    loginRequired: messages.header.loginRequired,
                  }}
                />
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
                <Button asChild>
                  <Link href="/sell">
                    <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
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
                className="w-full rounded-full border-gray-300 pr-10 focus:border-primary"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-label={t('header.searchButton')}
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full">
                  <Filter className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">{t('header.filterLabel')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
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
