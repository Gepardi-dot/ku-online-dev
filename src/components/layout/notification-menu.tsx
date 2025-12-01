"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  countUnreadNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type NotificationRecord,
} from "@/lib/services/notifications-client";
import { listFavorites } from "@/lib/services/favorites-client";
import { toast } from "@/hooks/use-toast";
import { useLocale } from "@/providers/locale-provider";

interface NotificationMenuStrings {
  label: string;
  empty: string;
  markAll: string;
  loginRequired: string;
}

interface NotificationMenuProps {
  userId?: string | null;
  strings: NotificationMenuStrings;
}

type ProductMeta = {
  thumbUrl?: string;
  title?: string | null;
  price?: number | null;
  currency?: string | null;
};

export default function NotificationMenu({ userId, strings }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [productMeta, setProductMeta] = useState<Record<string, ProductMeta>>({});
  const { locale, t } = useLocale();

  const canLoad = Boolean(userId);

  const refreshCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await countUnreadNotifications(userId);
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to count notifications", error);
    }
  }, [userId]);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    try {
      const items = await fetchNotifications(userId, 25);
      setNotifications(items);
      refreshCount();
    } catch (error) {
      console.error("Failed to load notifications", error);
      toast({
        title: "Unable to fetch notifications",
        description: "Please try again shortly.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, refreshCount]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Hydrate product thumbnails and basic info for listing notifications.
  useEffect(() => {
    if (!userId) return;

    const listingIds = notifications
      .filter((notification) => notification.type === "listing" && notification.relatedId)
      .map((notification) => notification.relatedId as string);

    const missing = listingIds.filter((id) => !productMeta[id]);
    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      try {
        const favorites = await listFavorites(userId, 100);
        const nextMap: Record<string, ProductMeta> = {};
        favorites.forEach((favorite) => {
          const product = favorite.product;
          if (!product?.id || nextMap[product.id]) return;
          const firstUrl = product.imageUrls?.[0];
          nextMap[product.id] = {
            thumbUrl: firstUrl,
            title: product.title,
            price: product.price ?? null,
            currency: product.currency ?? null,
          };
        });
        if (!cancelled && Object.keys(nextMap).length) {
          setProductMeta((prev) => ({ ...prev, ...nextMap }));
        }
      } catch {
        // Silent failure; bell still works with initials fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notifications, productMeta, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = subscribeToNotifications(userId, (notification, eventType) => {
      setNotifications((prev) => {
        const next = prev.filter((item) => item.id !== notification.id);
        if (eventType !== "DELETE") {
          next.unshift(notification);
        }
        return next
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });

      setUnreadCount((prev) => {
        if (!notification.isRead && eventType === "INSERT") {
          return prev + 1;
        }
        if (notification.isRead && eventType === "UPDATE") {
          return Math.max(0, prev - 1);
        }
        return prev;
      });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({
            title: strings.loginRequired,
          });
          return;
        }
        setOpen(true);
        void loadNotifications();
      } else {
        setOpen(false);
      }
    },
    [canLoad, loadNotifications, strings.loginRequired],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!userId) return;

    try {
      await markAllNotificationsRead(userId);
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark notifications read", error);
      toast({
        title: "Could not mark notifications as read",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }, [userId]);

  const handleNotificationClick = useCallback(
    async (notification: NotificationRecord) => {
      if (!userId || notification.isRead) {
        return;
      }

      try {
        await markNotificationRead(notification.id, userId);
        setNotifications((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Failed to mark notification read", error);
      }
    },
    [userId],
  );

  const indicator = useMemo(() => {
    if (!unreadCount) {
      return null;
    }
    const displayCount = unreadCount > 9 ? "9+" : String(unreadCount);
    return (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
        {displayCount}
      </span>
    );
  }, [unreadCount]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label={strings.label}>
          <Bell className="h-6 w-6" />
          {indicator}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">{strings.label}</div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-8">
              {strings.markAll}
            </Button>
          )}
        </div>
        <ScrollArea className="h-72">
          <div className="space-y-1 px-2 py-2">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">{strings.empty}</p>
            ) : (
              notifications.map((notification) => {
                const timeAgo = notification.createdAt
                  ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
                  : "";

                const isListing = notification.type === "listing";
                const rawName = notification.content ?? "";
                const productId = notification.relatedId ?? undefined;
                const meta = productId ? productMeta[productId] : undefined;
                const productName = (meta?.title ?? rawName) || "";
                const productInitial = productName.trim().charAt(0).toUpperCase() || "•";
                const thumbUrl = meta?.thumbUrl;
                const price = meta?.price;
                const currency = meta?.currency ?? "IQD";
                const formattedPrice =
                  typeof price === "number" ? `${price.toLocaleString(locale)} ${currency}` : null;

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted ${
                      notification.isRead ? "text-muted-foreground" : isListing ? "bg-rose-50" : "bg-primary/5"
                    }`}
                  >
                    {isListing ? (
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-white text-xs font-semibold text-foreground shadow-sm">
                          {thumbUrl ? (
                            <Image
                              src={thumbUrl}
                              alt={productName || "Listing image"}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              {productInitial}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              {productName && (
                                <p className="truncate text-sm font-semibold text-[#2D2D2D]">{productName}</p>
                              )}
                              {formattedPrice && (
                                <p className="truncate text-xs text-[#E67E22]">{formattedPrice}</p>
                              )}
                            </div>
                            {timeAgo && (
                              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            {t("product.soldBadge")}
                          </span>
                          <ArrowRight className="h-4 w-4 text-[#777777]" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{notification.title}</p>
                            {notification.content && (
                              <p className="mt-1 text-xs text-muted-foreground">{notification.content}</p>
                            )}
                          </div>
                          {timeAgo && <span className="text-xs text-muted-foreground">{timeAgo}</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {notification.type}
                          </Badge>
                          {!notification.isRead && (
                            <span className="text-[10px] font-medium text-primary">New</span>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
