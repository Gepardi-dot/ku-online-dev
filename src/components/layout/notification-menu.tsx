"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Loader2, X } from "lucide-react";
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
import { localizeText } from "@/lib/locale/localize";
import { formatCurrency } from "@/lib/locale/formatting";

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
  titleTranslations?: Record<string, string> | null;
  description?: string | null;
  descriptionTranslations?: Record<string, string> | null;
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
          .select("id, title, title_translations, description, description_translations, price, currency, images")
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
            titleTranslations: (row?.title_translations as Record<string, string> | null) ?? null,
            description: (row?.description as string | null) ?? null,
            descriptionTranslations: (row?.description_translations as Record<string, string> | null) ?? null,
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
      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-brand px-1 text-[10px] font-semibold text-white shadow-sm">
        {displayCount}
      </span>
    );
  }, [unreadCount]);

  const ebayTriggerClass =
    "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6d6d6]/80 bg-gradient-to-b from-[#fbfbfb] to-[#f1f1f1] text-[#1F1C1C] shadow-sm transition hover:border-brand/50 hover:text-brand hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40";

    return (
      <Popover open={open} onOpenChange={handleOpenChange} modal={true}>
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
          className="z-[90] flex w-[420px] max-h-[calc(100vh-5rem)] max-w-[calc(100vw-1rem)] flex-col overscroll-contain rounded-[32px] border border-white/60 bg-gradient-to-br from-white/30 via-white/20 to-white/5 !bg-transparent p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40"
        >
        <div className="flex h-full flex-col gap-3">

          <div className="flex items-center justify-between px-3 py-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-brand">{strings.label}</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-7 rounded-full text-xs text-brand hover:bg-brand/10 px-2">
                  {strings.markAll}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#eadbc5]/70 bg-white/80 text-[#2D2D2D] shadow-sm transition hover:bg-white hover:text-brand hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        <div className="max-h-[360px] overflow-y-auto w-full pr-3 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-brand [&::-webkit-scrollbar-thumb]:to-brand-light [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:from-brand-dark hover:[&::-webkit-scrollbar-thumb]:to-brand">
            <div className="space-y-3 p-0.5">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">{strings.empty}</p>
            ) : (
              notifications.map((notification) => {
                const isListing = notification.type === "listing";
                const rawName = notification.content ?? "";
                const productId = notification.relatedId ?? undefined;
                const meta = productId ? productMeta[productId] : undefined;
                const productName = (meta?.title ?? rawName) || notification.title || "";
                const localizedProductName = localizeText(productName, meta?.titleTranslations ?? null, locale);
                const localizedDescription = meta?.description
                  ? localizeText(meta.description, meta?.descriptionTranslations ?? null, locale)
                  : "";
                const productInitial = localizedProductName.trim().charAt(0).toUpperCase() || "•";
                const thumbUrl = meta?.thumbUrl;
                const price = meta?.price;
                const currency = meta?.currency ?? "IQD";
                const formattedPrice =
                  typeof price === "number" ? formatCurrency(price, currency, locale) : null;

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
                  const baseClasses = "shadow-sm border";
                  if (isSold) {
                    return { label: t("product.soldBadge"), className: `${baseClasses} bg-red-500 text-white border-red-600` };
                  }
                  if (isPriceUpdated) {
                    return {
                      label: t("product.priceUpdatedBadge"),
                      className: `${baseClasses} bg-amber-50 text-amber-700 border-amber-200`,
                    };
                  }
                  if (isBackOnline) {
                    return {
                      label: t("product.backOnlineBadge"),
                      className: `${baseClasses} bg-emerald-50 text-emerald-700 border-emerald-200`,
                    };
                  }
                  if (isListingUpdated) {
                    return {
                      label: t("product.listingUpdatedBadge"),
                      className: `${baseClasses} bg-slate-50 text-slate-700 border-slate-200`,
                    };
                  }
                  return { label: "Update", className: `${baseClasses} bg-slate-50 text-slate-700 border-slate-200` };
                })();

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`relative flex w-full items-start gap-3 rounded-3xl border p-3 text-left transition hover:-translate-y-px ${
                      notification.isRead
                        ? "border-[#eadbc5]/70 bg-white/50 shadow-sm ring-1 ring-black/[0.05] hover:border-[#eadbc5] hover:shadow-md hover:-translate-y-0.5"
                        : "border-[#eadbc5]/70 bg-white/60 shadow-sm ring-1 ring-black/[0.05] hover:border-[#eadbc5] hover:shadow-md hover:-translate-y-0.5"
                    }`}
                  >
                    {isListing ? (
                      <div className="flex w-full items-center gap-3">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/60 bg-white/80">
                          {thumbUrl ? (
                            <Image
                              src={thumbUrl}
                              alt={localizedProductName}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted/20 text-xs font-bold text-muted-foreground">
                              {productInitial}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                            <h4 dir="auto" className="flex-1 truncate text-sm font-bold text-[#2D2D2D] min-w-0 bidi-auto">
                              {localizedProductName}
                            </h4>
                            <span
                              className={`shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight ${listingBadge.className}`}
                            >
                              {listingBadge.label}
                            </span>
                            {!notification.isRead && (
                               <div className="absolute right-0 top-0 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-orange-500 ring-4 ring-white" />
                            )}
                          </div>
                          {localizedDescription && (
                            <p dir="auto" className="mt-0.5 truncate text-xs text-muted-foreground bidi-auto">
                              {localizedDescription}
                            </p>
                          )}
                          <div className="mt-0.5 flex items-center justify-between">
                            {formattedPrice && (
                              <p dir="auto" className="truncate text-sm font-bold text-brand bidi-auto">{formattedPrice}</p>
                            )}
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="flex-1 truncate text-sm font-bold text-[#2D2D2D] min-w-0">{notification.title}</h4>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="secondary" className="bg-[#f6efe3] text-[9px] font-bold uppercase tracking-tight text-[#2D2D2D] border-[#eadbc5]/70">
                              {notification.type}
                            </Badge>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </div>
                        {notification.content && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{notification.content}</p>
                        )}
                        {!notification.isRead && (
                          <div className="absolute right-4 top-4 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
          </div>
      </div>
      </PopoverContent>
    </Popover>
  );
}
