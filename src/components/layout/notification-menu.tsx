"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import { createClient } from "@/utils/supabase/client";
import { signStoragePaths } from "@/lib/services/storage-sign-client";
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
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

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
        const { data, error } = await supabase
          .from("products")
          .select("id, title, price, currency, images")
          .in("id", missing);

        if (error) {
          throw error;
        }

        const rows = Array.isArray(data) ? data : [];
        const firstImagePaths = rows
          .map((row) => (Array.isArray((row as any).images) ? (row as any).images[0] : null))
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

        let signedMap: Record<string, string> = {};
        if (firstImagePaths.length) {
          signedMap = await signStoragePaths(firstImagePaths, {
            transform: { width: 96, resize: "cover", quality: 70, format: "webp" },
          });
        }

        const nextMap: Record<string, ProductMeta> = {};
        rows.forEach((row: any) => {
          const id = row?.id as string | undefined;
          if (!id || nextMap[id]) return;
          const images = Array.isArray(row?.images) ? row.images.filter((item: unknown) => typeof item === "string") : [];
          const firstPath = images?.[0] as string | undefined;
          nextMap[id] = {
            thumbUrl: firstPath ? signedMap[firstPath] : undefined,
            title: (row?.title as string | null) ?? null,
            price: typeof row?.price === "number" ? row.price : row?.price ? Number(row.price) : null,
            currency: (row?.currency as string | null) ?? null,
          };
        });

        if (!cancelled && Object.keys(nextMap).length > 0) {
          setProductMeta((prev) => ({ ...prev, ...nextMap }));
        }
      } catch {
        // Silent failure; bell still works with initials fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notifications, productMeta, supabase, userId]);

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
      if (!userId) {
        return;
      }

      try {
        if (!notification.isRead) {
          await markNotificationRead(notification.id, userId);
          setNotifications((prev) =>
            prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }

        if (notification.type === "listing" && notification.relatedId) {
          setOpen(false);
          router.push(`/product/${notification.relatedId}`);
        }
      } catch (error) {
        console.error("Failed to mark notification read", error);
      }
    },
    [router, userId],
  );

  const indicator = useMemo(() => {
    if (!unreadCount) {
      return null;
    }
    const displayCount = unreadCount > 9 ? "9+" : String(unreadCount);
    return (
      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-[#E67E22] px-1 text-[10px] font-semibold text-white shadow-sm">
        {displayCount}
      </span>
    );
  }, [unreadCount]);

  const ebayTriggerClass =
    "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6d6d6]/80 bg-gradient-to-b from-[#fbfbfb] to-[#f1f1f1] text-[#1F1C1C] shadow-sm transition hover:border-[#E67E22]/50 hover:text-[#E67E22] hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40";

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" className={ebayTriggerClass} aria-label={strings.label}>
            <Bell className="h-6 w-6" strokeWidth={1.6} />
            {indicator}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={12}
          className="z-[90] w-[360px] max-w-[calc(100vw-1.5rem)] rounded-3xl border border-[#eadbc5]/70 bg-gradient-to-br from-[#fffdf7]/95 via-[#fff6ea]/90 to-[#f4ecdf]/90 p-4 shadow-[0_22px_60px_rgba(120,72,0,0.22)] backdrop-blur-2xl ring-1 ring-white/60"
        >
        <div className="flex items-center justify-between rounded-2xl border border-[#eadbc5]/70 bg-white/70 px-4 py-3 shadow-[0_10px_26px_rgba(120,72,0,0.10)]">
          <div className="text-sm font-semibold text-[#2D2D2D]">{strings.label}</div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-8 text-[#E67E22]">
              {strings.markAll}
            </Button>
          )}
        </div>
        <ScrollArea className="mt-3 max-h-[420px]">
          <div className="space-y-2 px-2 py-3">
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

                const metaKind =
                  notification.meta && typeof notification.meta === "object" && "kind" in (notification.meta as any)
                    ? String((notification.meta as any).kind)
                    : null;

                const listingTitle = notification.title || "";
                const isSold =
                  metaKind === "sold" || listingTitle.toLowerCase().includes("sold") || listingTitle === "Listing you saved was sold";
                const isPriceUpdated = metaKind === "price_updated" || listingTitle === "Price Updated";
                const isBackOnline = metaKind === "back_online" || listingTitle === "Listing Back Online";
                const isListingUpdated = metaKind === "listing_updated" || listingTitle === "Listing Updated";

                const listingBadge = (() => {
                  if (isSold) {
                    return { label: t("product.soldBadge"), className: "bg-red-500 text-white" };
                  }
                  if (isPriceUpdated) {
                    return {
                      label: t("product.priceUpdatedBadge"),
                      className: "bg-[#fff1df] text-[#9a4a00] border border-[#eadbc5]/70",
                    };
                  }
                  if (isBackOnline) {
                    return {
                      label: t("product.backOnlineBadge"),
                      className: "bg-emerald-600 text-white",
                    };
                  }
                  if (isListingUpdated) {
                    return {
                      label: t("product.listingUpdatedBadge"),
                      className: "bg-[#f6efe3] text-[#2D2D2D] border border-[#eadbc5]/70",
                    };
                  }
                  return { label: "Update", className: "bg-[#f6efe3] text-[#2D2D2D] border border-[#eadbc5]/70" };
                })();

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`w-full rounded-2xl border border-[#eadbc5]/70 bg-gradient-to-br from-white/85 via-[#fffaf2]/75 to-[#f6efe3]/75 px-3 py-3 text-left text-sm transition hover:-translate-y-px hover:border-[#eadbc5]/90 hover:shadow-[0_14px_34px_rgba(120,72,0,0.14)] ${
                      notification.isRead ? "text-muted-foreground" : "shadow-[0_10px_30px_rgba(120,72,0,0.12)]"
                    }`}
                  >
                    {isListing ? (
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/60 bg-white/80 text-xs font-semibold text-foreground shadow-sm">
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
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${listingBadge.className}`}
                          >
                            {listingBadge.label}
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
