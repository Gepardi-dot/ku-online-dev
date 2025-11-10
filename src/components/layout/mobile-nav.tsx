"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, PackagePlus, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { countFavorites } from "@/lib/services/favorites-client";
import { countUnreadMessages } from "@/lib/services/messages-client";

type NavItem = {
  key: "home" | "favorites" | "sell" | "messages" | "profile";
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  highlight?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/", labelKey: "nav.home", icon: Home },
  { key: "favorites", href: "/profile", labelKey: "nav.products", icon: ShoppingBag },
  { key: "sell", href: "/sell", labelKey: "nav.sell", icon: PackagePlus, highlight: true },
  { key: "messages", href: "/profile?tab=messages", labelKey: "nav.messages", icon: MessageSquare },
  { key: "profile", href: "/profile", labelKey: "nav.profile", icon: User },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  const [favoritesCount, setFavoritesCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data?.user?.id;
      if (!userId || !mounted) return;
      try {
        const [fav, unread] = await Promise.all([
          countFavorites(userId),
          countUnreadMessages(userId),
        ]);
        if (!mounted) return;
        setFavoritesCount(fav);
        setUnreadCount(unread);
      } catch (_) {
        // ignore
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm">
      <nav className="flex justify-around items-center h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            (item.href === "/" && pathname === item.href) ||
            (item.href !== "/" && pathname.startsWith(item.href.split("?")[0]));

          if (item.highlight) {
            return (
              <Link
                key={item.key}
                href={item.href}
                className="relative -mt-6 flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
                aria-label={t(item.labelKey)}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-full h-full text-sm font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={t(item.labelKey)}
            >
              <span className="relative inline-flex">
                <Icon className="h-6 w-6" aria-hidden="true" />
                {item.key === "favorites" && favoritesCount > 0 && (
                  <span className="absolute -top-1 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                    {favoritesCount > 9 ? "9+" : favoritesCount}
                  </span>
                )}
                {item.key === "messages" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-xs">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
