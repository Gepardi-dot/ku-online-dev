"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, PackagePlus, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { countFavorites } from "@/lib/services/favorites-client";
import { countUnreadMessages } from "@/lib/services/messages-client";
import { toast } from "@/hooks/use-toast";
import MessagesMenu from "./messages-menu";
import FavoritesMenu from "./favorites-menu";

type NavItem = {
  key: "home" | "favorites" | "sell" | "messages" | "profile";
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  highlight?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/", labelKey: "nav.home", icon: Home },
  // Products should route to the products list directly
  { key: "favorites", href: "/products", labelKey: "nav.products", icon: ShoppingBag },
  { key: "sell", href: "/sell", labelKey: "nav.sell", icon: PackagePlus, highlight: true },
  { key: "messages", href: "/profile?tab=messages", labelKey: "nav.messages", icon: MessageSquare },
  { key: "profile", href: "/profile?tab=overview", labelKey: "nav.profile", icon: User },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { t, messages } = useLocale();
  const [favoritesCount, setFavoritesCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const labelClassName =
    "mobile-nav-label mt-1 h-[1.1rem] max-w-19 truncate text-[11px] leading-tight";

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id ?? null;
      if (!mounted) return;
      setUserId(uid);
      if (!uid) return;
      try {
        const [fav, unread] = await Promise.all([countFavorites(uid), countUnreadMessages(uid)]);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = navRef.current;
    if (!nav) return;

    const updateOffset = () => {
      const height = nav.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      document.documentElement.style.setProperty("--mobile-nav-offset", `${height}px`);
    };

    updateOffset();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOffset);
      return () => {
        window.removeEventListener("resize", updateOffset);
      };
    }

    const observer = new ResizeObserver(updateOffset);
    observer.observe(nav);
    window.addEventListener("resize", updateOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, []);

  return (
    <div
      dir="ltr"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 w-full max-w-[100vw] border-t bg-background/95 backdrop-blur-sm pb-(--mobile-safe-area-bottom)"
      data-mobile-nav
      ref={navRef}
    >
      <nav
        className="flex items-end justify-between h-(--mobile-nav-height) w-full box-border px-3 pb-2 pt-1"
        style={{ ["--nav-icon-size" as any]: "calc(24px + 2mm)" }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            (item.href === "/" && pathname === item.href) ||
            (item.href !== "/" && pathname.startsWith(item.href.split("?")[0]));

          if (item.highlight) {
            return (
              <div key={item.key} className="flex flex-1 items-center justify-center">
                <Link
                  href={item.href}
                  className="relative -translate-y-3 z-10 flex h-16 w-[calc(8rem-4mm)] flex-none flex-col items-center justify-center gap-1 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
                  aria-label={t(item.labelKey)}
                >
                  <Icon className="h-(--nav-icon-size) w-(--nav-icon-size)" aria-hidden="true" />
                  <span dir="auto" className={cn("bidi-auto", labelClassName)}>
                    {t(item.labelKey)}
                  </span>
                </Link>
              </div>
            );
          }

          // Custom handling for Messages: open chat sheet instead of routing
          if (item.key === "messages") {
            return (
              <div
                key={item.key}
                className={cn(
                  "flex flex-1 flex-col items-center justify-end gap-1 text-sm font-medium",
                  pathname.startsWith("/profile") ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={t(item.labelKey)}
              >
                <MessagesMenu
                  userId={userId}
                  strings={{
                    label: t("header.messages"),
                    empty: messages.header.messagesEmpty,
                    loginRequired: messages.header.loginRequired,
                    typePlaceholder: messages.header.typeMessage,
                    send: messages.header.sendMessage,
                  }}
                  compactTrigger
                  triggerClassName="text-muted-foreground hover:text-foreground h-(--nav-icon-size) w-(--nav-icon-size) p-0"
                  triggerIcon={<MessageSquare className="h-full w-full" strokeWidth={2} />}
                />
                <span dir="auto" className={cn("bidi-auto", labelClassName)}>
                  {t(item.labelKey)}
                </span>
              </div>
            );
          }

          // Custom handling for Products: open favorites/watchlist sheet
          if (item.key === "favorites") {
            return (
              <div
                key={item.key}
                className={cn(
                  "flex flex-1 flex-col items-center justify-end gap-1 text-sm font-medium",
                  "text-muted-foreground hover:text-foreground",
                )}
                aria-label={t(item.labelKey)}
              >
                <FavoritesMenu
                  userId={userId}
                  strings={{
                    label: messages.header.favorites,
                    empty: messages.header.favoritesEmpty,
                    loginRequired: messages.header.loginRequired,
                  }}
                  compactTrigger
                  triggerClassName="text-muted-foreground hover:text-foreground h-(--nav-icon-size) w-(--nav-icon-size) p-0"
                  triggerIcon={<ShoppingBag className="h-full w-full" strokeWidth={2} />}
                />
                <span dir="auto" className={cn("bidi-auto", labelClassName)}>
                  {t(item.labelKey)}
                </span>
              </div>
            );
          }

          // Custom handling for Profile: go to profile when signed in,
          // otherwise show a login-required hint.
          if (item.key === "profile") {
            const baseClass = cn(
              "flex flex-1 flex-col items-center justify-end gap-1 text-sm font-medium transition-colors",
              pathname.startsWith("/profile") ? "text-primary" : "text-muted-foreground hover:text-foreground",
            );

            if (!userId) {
              return (
                <button
                  key={item.key}
                  type="button"
                  className={baseClass}
                  aria-label={t(item.labelKey)}
                  onClick={() =>
                    toast({
                      title: messages.header.loginRequired,
                      variant: "brand",
                    })
                  }
                >
                <span className="inline-flex items-center justify-center h-(--nav-icon-size) w-(--nav-icon-size)">
                  <Icon className="h-full w-full" aria-hidden="true" />
                </span>
                <span dir="auto" className={cn("bidi-auto", labelClassName)}>
                  {t(item.labelKey)}
                </span>
              </button>
            );
          }

            return (
              <Link key={item.key} href={item.href} className={baseClass} aria-label={t(item.labelKey)}>
                <span className="inline-flex items-center justify-center h-(--nav-icon-size) w-(--nav-icon-size)">
                  <Icon className="h-full w-full" aria-hidden="true" />
                </span>
                <span dir="auto" className={cn("bidi-auto", labelClassName)}>
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-end gap-1 text-sm font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={t(item.labelKey)}
            >
              <span className="inline-flex items-center justify-center h-(--nav-icon-size) w-(--nav-icon-size)">
                <Icon className="h-full w-full" aria-hidden="true" />
              </span>
              <span dir="auto" className={cn("bidi-auto", labelClassName)}>
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
