"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import { ar, ckb, enUS } from "date-fns/locale";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  countUnreadMessages,
  deleteConversation,
  fetchConversation,
  fetchMessages,
  getCachedConversations,
  listConversationsForUserWithOptions,
  prefetchConversationsForUser,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  subscribeToIncomingMessages,
  type ConversationSummary,
  type MessageRecord,
} from "@/lib/services/messages-client";
import { chatTimingNow, logChatTiming } from "@/lib/services/chat-timing";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import { rtlLocales } from "@/lib/locale/dictionary";

const MOBILE_BOTTOM_GAP_PX = 92; // Increased spacing to ensure sheet clears mobile nav
const EXTRA_KEYBOARD_LIFT_PX = 24;
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const CONVERSATION_CACHE_TTL_MS = 60_000;
const PREFETCH_DELAY_MS = 1200;

const hasArabicScript = (value?: string | null) =>
  typeof value === "string" && value.length > 0 && ARABIC_SCRIPT_REGEX.test(value);

interface MessagesMenuStrings {
  label: string;
  empty: string;
  loginRequired: string;
  typePlaceholder: string;
  send: string;
}

interface MessagesMenuProps {
  userId?: string | null;
  strings: MessagesMenuStrings;
  compactTrigger?: boolean;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
}

export default function MessagesMenu({
  userId,
  strings,
  compactTrigger = false,
  triggerClassName,
  triggerIcon,
}: MessagesMenuProps) {
  const { locale, t } = useLocale();
  const isRtl = rtlLocales.includes(locale);
  const relativeTimeLocales = useMemo(() => {
    if (locale === "ku") return ["ckb-u-nu-arab", "ckb", "ku-u-nu-arab", "ku"];
    if (locale === "ar") return ["ar-u-nu-arab", "ar"];
    return [locale, "en-US"];
  }, [locale]);
  const resolvedRelativeTimeLocale = useMemo(() => {
    const supported = Intl.RelativeTimeFormat.supportedLocalesOf(relativeTimeLocales);
    return supported[0] ?? null;
  }, [relativeTimeLocales]);
  const relativeTimeFormatter = useMemo(
    () => (resolvedRelativeTimeLocale ? new Intl.RelativeTimeFormat(resolvedRelativeTimeLocale, { numeric: "auto" }) : null),
    [resolvedRelativeTimeLocale],
  );
  const dateFnsLocale = useMemo(() => {
    if (locale === "ku") return ckb;
    if (locale === "ar") return ar;
    return enUS;
  }, [locale]);
  const formatRelativeTime = useCallback(
    (date: Date) => {
      if (!relativeTimeFormatter) {
        return formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocale });
      }
      const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
      const absSeconds = Math.abs(diffSeconds);

      if (absSeconds < 60) {
        return relativeTimeFormatter.format(diffSeconds, "second");
      }

      const diffMinutes = Math.round(diffSeconds / 60);
      if (Math.abs(diffMinutes) < 60) {
        return relativeTimeFormatter.format(diffMinutes, "minute");
      }

      const diffHours = Math.round(diffMinutes / 60);
      if (Math.abs(diffHours) < 24) {
        return relativeTimeFormatter.format(diffHours, "hour");
      }

      const diffDays = Math.round(diffHours / 24);
      if (Math.abs(diffDays) < 30) {
        return relativeTimeFormatter.format(diffDays, "day");
      }

      const diffMonths = Math.round(diffDays / 30);
      if (Math.abs(diffMonths) < 12) {
        return relativeTimeFormatter.format(diffMonths, "month");
      }

      const diffYears = Math.round(diffMonths / 12);
      return relativeTimeFormatter.format(diffYears, "year");
    },
    [relativeTimeFormatter, dateFnsLocale],
  );

  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [cardHeight, setCardHeight] = useState<number>(420);
  const [cardOffsetTop, setCardOffsetTop] = useState<number>(56);
  const [mobileNavHeight, setMobileNavHeight] = useState<number>(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number>(0);
  const [visualViewportOffsetTop, setVisualViewportOffsetTop] = useState<number>(0);
  const [sheetOffsetY, setSheetOffsetY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);

  const conversationsRef = useRef<ConversationSummary[]>([]);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const inputBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetDragStateRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    lastTime: number;
  } | null>(null);
  const sheetOffsetRef = useRef(0);
  const messagesScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const openStartRef = useRef<number | null>(null);
  const conversationLoadSeqRef = useRef(0);
  const messageLoadSeqRef = useRef(0);
  const threadOpenStartRef = useRef<number | null>(null);
  const prefetchTimerRef = useRef<number | null>(null);
  const prefetchedUserRef = useRef<string | null>(null);
  const conversationScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const conversationViewportRef = useRef<HTMLDivElement | null>(null);

  const canLoad = Boolean(userId);

  // --- Layout / viewport ---

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const width = window.innerWidth || 0;
      const isSmallViewport = width < 768;
      setIsMobile(isSmallViewport);

      const visualViewport = window.visualViewport;
      const nextVisualHeight = visualViewport?.height ?? window.innerHeight ?? 0;
      const nextVisualOffsetTop = visualViewport?.offsetTop ?? 0;
      setVisualViewportHeight(nextVisualHeight);
      setVisualViewportOffsetTop(nextVisualOffsetTop);

      // Compute layout offsets so the glass card sits neatly
      // between the top chrome (announcement + header) and
      // the bottom mobile nav bar.
      const announcement = document.querySelector<HTMLElement>("[data-announcement-bar]");
      const header = document.getElementById("ku-main-header");
      const mobileNav = document.querySelector<HTMLElement>("[data-mobile-nav]");

      let offsetTop = 16; // base breathing room

      if (announcement) {
        offsetTop += announcement.getBoundingClientRect().height;
      }
      if (header) {
        offsetTop += header.getBoundingClientRect().height;
      }

      const navHeight = mobileNav ? mobileNav.getBoundingClientRect().height : 0;
      const effectiveOffsetTop = Math.max(16, offsetTop - nextVisualOffsetTop);
      const viewportHeight = isSmallViewport ? nextVisualHeight : window.innerHeight || 0;

      // On mobile we want the sheet to sit just above
      // the bottom navigation bar with a small gap, while
      // on larger screens we keep a bit more breathing room.
      const extraGap = isSmallViewport ? MOBILE_BOTTOM_GAP_PX : 24;
      let available = viewportHeight - effectiveOffsetTop - navHeight - extraGap;

      // Clamp the card height so it stays elegant on all screens.
      if (!Number.isFinite(available) || available <= 0) {
        available = 420;
      }
      const minHeight = isSmallViewport ? 440 : 320;
      const maxHeight = isSmallViewport ? Math.min(640, viewportHeight - effectiveOffsetTop - extraGap) : 420;
      const clamped = Math.max(minHeight, Math.min(maxHeight, available));

      setCardOffsetTop(effectiveOffsetTop);
      setCardHeight(clamped);
      setMobileNavHeight(navHeight);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!open || !isMobile) return;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = previousOverflow;
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    openStartRef.current = chatTimingNow();
  }, [open]);

  // --- Data loading helpers ---

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await countUnreadMessages(userId);
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to count unread messages", error);
    }
  }, [userId]);

  const loadConversations = useCallback(async (options?: { preferCache?: boolean }) => {
    if (!userId) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    const preferCache = options?.preferCache !== false;
    let usedCache = false;
    let cachedCount = 0;

    if (preferCache) {
      const cached = getCachedConversations(userId, CONVERSATION_CACHE_TTL_MS);
      if (cached) {
        usedCache = true;
        cachedCount = cached.length;
        setConversations(cached);
        setActiveConversationId((previous) => {
          if (!previous) return null;
          return cached.some((conversation) => conversation.id === previous) ? previous : null;
        });
        if (openStartRef.current) {
          logChatTiming("menu:conversations:cache", chatTimingNow() - openStartRef.current, {
            count: cachedCount,
          });
          openStartRef.current = null;
        }
      }
    }

    const loadId = conversationLoadSeqRef.current + 1;
    conversationLoadSeqRef.current = loadId;
    const startedAt = chatTimingNow();
    setLoadingConversations(!usedCache);
    let resultCount = 0;
    try {
      const results = await listConversationsForUserWithOptions(userId, {
        preferCache: false,
        cacheTtlMs: CONVERSATION_CACHE_TTL_MS,
      });
      resultCount = results.length;
      setConversations(results);

      setActiveConversationId((previous) => {
        if (!previous) return null;
        return results.some((conversation) => conversation.id === previous) ? previous : null;
      });
      const meta: Record<string, unknown> = { count: resultCount, loadId };
      if (openStartRef.current) {
        meta.openMs = Math.round(chatTimingNow() - openStartRef.current);
        openStartRef.current = null;
      }
      logChatTiming("menu:conversations:load", chatTimingNow() - startedAt, meta);
      if (typeof window !== "undefined") {
        const renderStart = chatTimingNow();
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            logChatTiming("menu:conversations:render", chatTimingNow() - renderStart, {
              count: resultCount,
              loadId,
            });
          });
        });
      }
    } catch (error) {
      console.error("Failed to load conversations", error);
      logChatTiming("menu:conversations:error", chatTimingNow() - startedAt, { loadId });
      toast({
        title: "Unable to load conversations",
        description: "Please try again soon.",
        variant: "destructive",
      });
    } finally {
      setLoadingConversations(false);
    }
  }, [userId]);

  const loadMessages = useCallback(
    async (conversationId: string | null, options?: { before?: string; append?: boolean }) => {
      if (!conversationId || !userId) {
        setMessages([]);
        setHasMore(false);
        setOldestCursor(null);
        return;
      }

      const loadId = messageLoadSeqRef.current + 1;
      messageLoadSeqRef.current = loadId;
      const startedAt = chatTimingNow();
      setLoadingMessages(true);
      try {
        const history = await fetchMessages(conversationId, { limit: 60, before: options?.before });

        setMessages((previous) => (options?.append ? [...history, ...previous] : history));

        const oldest = history[0]?.createdAt ?? null;
        setOldestCursor(options?.append ? oldest ?? oldestCursor : oldest);
        setHasMore(history.length >= 60);

        await markConversationRead(conversationId, userId);

        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, hasUnread: false, unreadCount: 0 }
              : conversation,
          ),
        );
        void refreshUnread();
        const meta: Record<string, unknown> = {
          count: history.length,
          loadId,
          append: Boolean(options?.append),
          hasBefore: Boolean(options?.before),
        };
        if (threadOpenStartRef.current) {
          meta.openMs = Math.round(chatTimingNow() - threadOpenStartRef.current);
          threadOpenStartRef.current = null;
        }
        logChatTiming("menu:messages:load", chatTimingNow() - startedAt, meta);
        if (typeof window !== "undefined") {
          const renderStart = chatTimingNow();
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              logChatTiming("menu:messages:render", chatTimingNow() - renderStart, {
                count: history.length,
                loadId,
              });
            });
          });
        }
      } catch (error) {
        console.error("Failed to load messages", error);
        logChatTiming("menu:messages:error", chatTimingNow() - startedAt, { loadId });
        toast({
          title: "Unable to load messages",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingMessages(false);
      }
    },
    [userId, oldestCursor, refreshUnread],
  );

  // --- Initial unread + conversations when opened ---

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    if (!userId || !open) return;
    void loadConversations();
  }, [userId, open, loadConversations]);

  useEffect(() => {
    if (!userId || open) return;
    if (prefetchedUserRef.current === userId) return;
    prefetchedUserRef.current = userId;

    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchConversationsForUser(userId, CONVERSATION_CACHE_TTL_MS);
    }, PREFETCH_DELAY_MS);

    return () => {
      if (prefetchTimerRef.current) {
        window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
    };
  }, [userId, open]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // --- Realtime subscriptions ---

  useEffect(() => {
    if (!userId) return;

    const channel = subscribeToIncomingMessages(userId, (message) => {
      const shouldFlagUnread = !(open && message.conversationId === activeConversationId);

      // Keep contact list up to date
      setConversations((previous) => {
        const existing = previous.find((item) => item.id === message.conversationId);
        if (!existing) {
          return previous;
        }

        const nextUnreadCount =
          shouldFlagUnread ? (existing.unreadCount ?? (existing.hasUnread ? 1 : 0)) + 1 : 0;
        const updated: ConversationSummary = {
          ...existing,
          lastMessage: message.content,
          lastMessageAt: message.createdAt,
          hasUnread: shouldFlagUnread ? true : false,
          unreadCount: nextUnreadCount,
        };

        const others = previous.filter((item) => item.id !== message.conversationId);
        return [updated, ...others];
      });

      // Only bump unread when this thread isn't focused / open
      if (shouldFlagUnread) {
        setUnreadCount((previous) => previous + 1);
      }

      // If this conversation is totally new, hydrate it
      if (!conversationsRef.current.some((conversation) => conversation.id === message.conversationId)) {
        void fetchConversation(message.conversationId)
          .then((summary) => {
            if (!summary) return;
            const summaryWithUnread = shouldFlagUnread
              ? { ...summary, hasUnread: true, unreadCount: 1 }
              : { ...summary, hasUnread: false, unreadCount: 0 };

            setConversations((previous) => {
              if (previous.some((item) => item.id === summaryWithUnread.id)) {
                return previous;
              }
              return [summaryWithUnread, ...previous];
            });
          })
          .catch((error) => {
            console.error("Failed to hydrate conversation from realtime message", error);
          });
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, open, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !open || !userId) return;

    const channel = subscribeToConversation(activeConversationId, async (message) => {
      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) {
          return previous;
        }
        return [...previous, message];
      });

      if (message.receiverId === userId) {
        try {
          await markConversationRead(activeConversationId, userId);
          setConversations((previous) =>
            previous.map((conversation) =>
              conversation.id === activeConversationId
                ? { ...conversation, hasUnread: false, unreadCount: 0 }
                : conversation,
            ),
          );
        } catch (error) {
          console.error("Failed to mark message read", error);
        }
      }

      setConversations((previous) => {
        const existing = previous.find((item) => item.id === message.conversationId);
        if (!existing) {
          return previous;
        }

        const updated: ConversationSummary = {
          ...existing,
          lastMessage: message.content,
          lastMessageAt: message.createdAt,
        };
        const others = previous.filter((item) => item.id !== message.conversationId);
        return [updated, ...others];
      });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [activeConversationId, userId, open]);

  // --- Message loading when active thread changes ---

  useEffect(() => {
    if (!activeConversationId || !open) return;
    threadOpenStartRef.current = chatTimingNow();
  }, [activeConversationId, open]);

  useEffect(() => {
    if (!activeConversationId || !open) {
      setMessages([]);
      setHasMore(false);
      setOldestCursor(null);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId, open, loadMessages]);

  // Clear draft when switching threads
  useEffect(() => {
    setDraft("");
    autoScrollEnabledRef.current = true;
  }, [activeConversationId]);

  // --- Derived values ---

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const counterpart = useMemo(() => {
    if (!activeConversation || !userId) return null;

    if (activeConversation.sellerId === userId) {
      return activeConversation.buyer;
    }
    return activeConversation.seller;
  }, [activeConversation, userId]);

  const indicator = useMemo(() => {
    if (!unreadCount) return null;
    const displayCount = unreadCount > 9 ? "9+" : String(unreadCount);

    return (
      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-brand px-1 text-[10px] font-semibold text-white shadow-sm">
        {displayCount}
      </span>
    );
  }, [unreadCount]);
  const chipClass =
    "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6d6d6]/80 bg-linear-to-b from-[#fbfbfb] to-[#f1f1f1] text-[#1F1C1C] shadow-sm transition hover:border-brand/50 hover:text-brand hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40 active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:border-brand/60 data-[state=open]:bg-white/90 data-[state=open]:shadow-[0_16px_38px_rgba(247,111,29,0.18)]";

  const resolveMessagesViewport = useCallback(() => {
    const root = messagesScrollAreaRef.current;
    if (!root) return null;
    const viewport = root.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    messagesViewportRef.current = viewport;
    return viewport;
  }, []);

  const resolveConversationViewport = useCallback(() => {
    const root = conversationScrollAreaRef.current;
    if (!root) return null;
    const viewport = root.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    conversationViewportRef.current = viewport;
    return viewport;
  }, []);

  const updateAutoScrollState = useCallback(() => {
    const viewport = resolveMessagesViewport();
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    autoScrollEnabledRef.current = distance < 64;
  }, [resolveMessagesViewport]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const viewport = resolveMessagesViewport();
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    },
    [resolveMessagesViewport],
  );

  const requestScrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (typeof window === "undefined") return;
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollToBottom(behavior);
        scrollRafRef.current = null;
      });
    },
    [scrollToBottom],
  );

  const showLoadMoreRow = Boolean(hasMore && oldestCursor);
  const messagesCount = messages.length + (showLoadMoreRow ? 1 : 0);

  const conversationVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: resolveConversationViewport,
    estimateSize: () => 76,
    overscan: 6,
  });

  const messagesVirtualizer = useVirtualizer({
    count: messagesCount,
    getScrollElement: resolveMessagesViewport,
    estimateSize: (index) => (showLoadMoreRow && index === messages.length ? 36 : 72),
    overscan: 8,
  });

  useEffect(() => {
    conversationVirtualizer.measure();
  }, [conversations.length, conversationVirtualizer]);

  useEffect(() => {
    messagesVirtualizer.measure();
  }, [messages.length, showLoadMoreRow, messagesVirtualizer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== "messages-menu") {
        setOpen(false);
      }
    };
    window.addEventListener("ku-menu-open", handler);
    return () => window.removeEventListener("ku-menu-open", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const raf = window.requestAnimationFrame(() => {
      updateAutoScrollState();
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [open, activeConversationId, mobileView, updateAutoScrollState]);

  useEffect(() => {
    if (!open) return;
    const viewport = resolveMessagesViewport();
    if (!viewport) return;

    const handleScroll = () => updateAutoScrollState();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    updateAutoScrollState();

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [open, activeConversationId, mobileView, resolveMessagesViewport, updateAutoScrollState]);

  useEffect(() => {
    if (!open || !activeConversationId) return;
    if (loadingMessages) return;
    if (autoScrollEnabledRef.current || isInputFocused) {
      requestScrollToBottom(isInputFocused ? "smooth" : "auto");
    }
  }, [messages, open, activeConversationId, loadingMessages, isInputFocused, requestScrollToBottom]);

  // --- Event handlers ---

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({ title: strings.loginRequired, variant: "brand" });
          return;
        }
        setMobileView("list");
        setIsInputFocused(false);
        setOpen(true);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ku-menu-open", { detail: { source: "messages-menu" } }));
        }
      } else {
        setIsInputFocused(false);
        setOpen(false);
      }
    },
    [canLoad, strings.loginRequired],
  );

  useEffect(() => {
    if (!open) {
      setIsInputFocused(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (inputBlurTimeoutRef.current) {
        clearTimeout(inputBlurTimeoutRef.current);
        inputBlurTimeoutRef.current = null;
      }
      if (dragCloseTimeoutRef.current) {
        clearTimeout(dragCloseTimeoutRef.current);
        dragCloseTimeoutRef.current = null;
      }
      if (scrollRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const handleInputFocus = useCallback(() => {
    if (inputBlurTimeoutRef.current) {
      clearTimeout(inputBlurTimeoutRef.current);
      inputBlurTimeoutRef.current = null;
    }
    setIsInputFocused(true);
    autoScrollEnabledRef.current = true;
    requestScrollToBottom("smooth");
  }, [requestScrollToBottom]);

  const handleInputBlur = useCallback(() => {
    if (typeof window === "undefined") {
      setIsInputFocused(false);
      return;
    }
    if (inputBlurTimeoutRef.current) {
      clearTimeout(inputBlurTimeoutRef.current);
    }
    inputBlurTimeoutRef.current = setTimeout(() => {
      setIsInputFocused(false);
      inputBlurTimeoutRef.current = null;
    }, 120);
  }, []);

  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
      autoScrollEnabledRef.current = true;
      if (open) {
        void loadMessages(conversationId);
      }
      if (isMobile) {
        setMobileView("thread");
      }
    },
    [open, loadMessages, isMobile],
  );

  const handleSendMessage = useCallback(async () => {
    if (!activeConversation || !userId || sending) return;

    const trimmed = draft.trim();
    if (!trimmed) return;

    setSending(true);

    const receiverId =
      activeConversation.sellerId === userId ? activeConversation.buyerId : activeConversation.sellerId;

    try {
      const message = await sendMessage({
        conversationId: activeConversation.id,
        senderId: userId,
        receiverId,
        productId: activeConversation.productId,
        content: trimmed,
      });

      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) {
          return previous;
        }
        return [...previous, message];
      });
      setDraft("");
      autoScrollEnabledRef.current = true;
      requestScrollToBottom("smooth");
    } catch (error) {
      console.error("Failed to send message", error);
      const description =
        error instanceof Error && error.message
          ? error.message
          : "Please try sending your message again.";
      toast({
        title: "Message not sent",
        description,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [activeConversation, userId, draft, sending, requestScrollToBottom]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversation(conversationId);
        setConversations((previous) => previous.filter((item) => item.id !== conversationId));

        if (activeConversationId === conversationId) {
          setActiveConversationId(null);
          setMessages([]);
        }

        void refreshUnread();
      } catch (error) {
        console.error("Failed to delete conversation", error);
        toast({
          title: "Could not delete conversation",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [activeConversationId, refreshUnread],
  );

  // --- Render helpers ---

  const renderConversationSummary = (conversation: ConversationSummary) => {
    const isActive = conversation.id === activeConversationId;
    const isUnread = conversation.hasUnread;

    const target = conversation.sellerId === userId ? conversation.buyer : conversation.seller;
    const targetName = target?.fullName?.trim() || target?.id || t("header.chatUnknownUser");
    const avatarLetter = targetName.charAt(0).toUpperCase() || "U";
    const avatarUrl = target?.avatarUrl ?? null;

    const preview = conversation.lastMessage ?? "";
    const targetNameIsArabic = hasArabicScript(targetName);
    const previewIsArabic = hasArabicScript(preview);

    return (
      <div
        className={cn(
          "flex w-full items-center gap-3 rounded-3xl border p-3 text-sm shadow-sm transition-all hover:-translate-y-px hover:shadow-md active:translate-y-0",
          isActive
            ? "border-brand/40 bg-[#FFF8F0]/90 shadow-md ring-1 ring-brand/20"
            : isUnread
              ? "border-brand/30 bg-[#FFF3E6]/90 shadow-md ring-1 ring-brand/15 hover:bg-[#FFEDD8]/95"
              : "border-[#eadbc5]/60 bg-[#FFFBF5]/80 ring-1 ring-black/3 hover:border-brand/30 hover:bg-[#FFF8F0]/90",
        )}
      >
        <button
          type="button"
          onClick={() => handleConversationSelect(conversation.id)}
          dir="ltr"
          className="flex flex-1 items-center gap-3 text-left"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl ?? undefined} alt={targetName} />
            <AvatarFallback className="bg-[#F6ECE0] text-[#2D2D2D]">{avatarLetter}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 min-w-0 items-start gap-2">
            <div className="flex-1 min-w-0">
              <p
                dir="auto"
                className={cn(
                  "text-sm font-semibold font-sans text-[#2D2D2D] bidi-auto",
                  isUnread ? "font-bold" : "font-semibold",
                  targetNameIsArabic && "font-arabic",
                )}
              >
                {targetName}
              </p>
              {preview && (
                <p
                  dir="auto"
                  className={cn(
                    "mt-0.5 line-clamp-1 text-[13px] leading-snug font-sans bidi-auto",
                    isUnread ? "text-[#2D2D2D]" : "text-[#777777]",
                    previewIsArabic && "font-arabic",
                  )}
                >
                  {preview}
                </p>
              )}
            </div>
            <div className={cn("flex items-center gap-2", isRtl ? "mr-2" : "ml-2")} />
          </div>
        </button>
        <button
          type="button"
          onClick={() => void handleDeleteConversation(conversation.id)}
          aria-label={t("header.chatDeleteConversation")}
          className={cn(isRtl ? "mr-1" : "ml-1", "text-brand hover:text-[#c76a16]")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderMessages = () => {
    const handleLoadMore = () => {
      if (!activeConversationId || !hasMore || !oldestCursor) return;
      void loadMessages(activeConversationId, { before: oldestCursor, append: true });
    };

    if (!activeConversationId) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-[#777777]">
          {strings.empty}
        </div>
      );
    }

    if (loadingMessages) {
      return (
        <div className="flex h-full items-center justify-center text-[#777777]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[#777777]">
          {strings.empty}
        </div>
      );
    }

    const virtualItems = messagesVirtualizer.getVirtualItems();

    return (
      <div style={{ height: messagesVirtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((virtualItem) => {
          if (showLoadMoreRow && virtualItem.index === messages.length) {
            return (
              <div
                key="load-more"
                ref={messagesVirtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="text-[11px] text-brand underline-offset-2 hover:underline"
                    onClick={handleLoadMore}
                    disabled={loadingMessages}
                  >
                    {loadingMessages ? t("header.chatLoading") : t("header.chatLoadEarlier")}
                  </button>
                </div>
              </div>
            );
          }

          const message = messages[virtualItem.index];
          if (!message) return null;
          const isViewer = message.senderId === userId;
          const timestamp = formatRelativeTime(new Date(message.createdAt));
          const messageIsArabic = hasArabicScript(message.content);

          return (
            <div
              key={message.id}
              ref={messagesVirtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <div
                className={cn(
                  "flex flex-col gap-1",
                  isViewer ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[70%] rounded-[16px] px-3.5 py-1.5 text-[15px] leading-relaxed shadow-sm",
                    messageIsArabic ? "font-arabic" : "font-sans",
                    isViewer
                      ? "bg-brand text-white"
                      : "bg-[#EBDAC8] text-[#2D2D2D]",
                  )}
                >
                  <p
                    dir="auto"
                    className={cn("whitespace-pre-line bidi-auto", messageIsArabic && "font-arabic")}
                  >
                    {message.content}
                  </p>
                </div>
                <span dir="auto" className="text-[10px] uppercase tracking-wide text-[#777777] bidi-auto">
                  {timestamp}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderConversationListSection = () => (
    <div className="flex h-full flex-col rounded-[32px] border border-white/60 bg-linear-to-br from-white/30 via-white/20 to-white/5 bg-transparent! p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40">
      <div className="flex items-center justify-between px-3 py-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-brand">
          {t("header.chatContacts")}
        </span>
      </div>
      <ScrollArea ref={conversationScrollAreaRef} className={cn("flex-1", isRtl ? "pl-1" : "pr-1")}>
        {loadingConversations ? (
          <div className="flex h-full items-center justify-center text-[#777777]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[#777777]">
            {strings.empty}
          </p>
        ) : (
          <div style={{ height: conversationVirtualizer.getTotalSize(), position: "relative" }}>
            {conversationVirtualizer.getVirtualItems().map((virtualItem) => {
              const conversation = conversations[virtualItem.index];
              if (!conversation) return null;
              return (
                <div
                  key={conversation.id}
                  ref={conversationVirtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="absolute left-0 top-0 w-full pb-3"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  {renderConversationSummary(conversation)}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const renderConversationThreadSection = (showBackButton: boolean) => {
    const product = activeConversation?.product ?? null;
    const productImageSrc =
      product?.imageUrls?.find((url) => typeof url === "string" && url.trim().length > 0) ?? null;

    return (
      <div
        className={cn(
          "flex h-full flex-col",
          isKeyboardMode ? "rounded-none bg-white/95" : "rounded-[24px] bg-transparent",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 border-b border-[#D9C4AF]",
            isKeyboardMode ? "px-4 py-3" : "px-5 py-3",
          )}
        >
          {showBackButton && (
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 text-xs text-brand hover:underline md:hidden",
                isRtl ? "ml-2" : "mr-2",
              )}
              onClick={() => setMobileView("list")}
            >
              {isRtl ? <ArrowRight className="h-3 w-3" /> : <ArrowLeft className="h-3 w-3" />}
              <span>{t("header.chatBack")}</span>
            </button>
          )}
          <div className="flex flex-1 items-center gap-3">
            {product && (
              <Link
                href={`/product/${product.id}`}
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#D9C4AF] bg-[#EBDAC8]"
              >
                {productImageSrc ? (
                  <Image src={productImageSrc} alt={product.title} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-[#777777]">
                    {t("header.chatNoImage")}
                  </div>
                )}
              </Link>
            )}
            <div className="flex flex-col">
              <p className="text-sm font-semibold text-[#2D2D2D]">
                {counterpart?.fullName
                  ? `${t("header.chatWith")} ${counterpart.fullName}`
                  : t("header.chatTitle")}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-[#777777]">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                {isRtl ? (
                  <>
                    <span>{t("header.chatOnline")}</span>
                  </>
                ) : (
                  <>
                    <span>{t("header.chatStatus")}</span>
                    <span className="text-[#C4A98A]">{"\u00B7"}</span>
                    <span>{t("header.chatOnline")}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <ScrollArea
          ref={messagesScrollAreaRef}
          className={cn("flex-1", isKeyboardMode ? "bg-white/70 px-4 py-3" : "px-5 py-4")}
        >
          {renderMessages()}
        </ScrollArea>

        <div
          className={cn(
            "border-t border-[#EBDAC8]",
            isKeyboardMode
              ? "px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
              : "px-5 py-3",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-full bg-[#f5f5f5] px-1.5 py-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={strings.typePlaceholder}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                className="h-10 rounded-full border border-[#e3e3e3] bg-white px-4 text-sm text-[#2D2D2D] placeholder:text-[#777777] focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSendMessage();
                  }
                }}
                disabled={!activeConversation || sending}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSendMessage()}
              disabled={!activeConversation || sending}
              aria-label={strings.send}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-md disabled:opacity-60"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Render root dropdown ---

  const isKeyboardMode = isMobile && isInputFocused;
  const mobileTopPaddingPx = Math.max(cardOffsetTop, 16);
  const mobileBottomPaddingPx = mobileNavHeight + 12 + (isKeyboardMode ? EXTRA_KEYBOARD_LIFT_PX : 0);
  const mobileCardHeight = isKeyboardMode ? "100%" : cardHeight;
  const visualHeightFallback = typeof window !== "undefined" ? window.innerHeight : 0;
  const resolvedVisualViewportHeight = Math.round(visualViewportHeight || visualHeightFallback || 0);
  const resolvedVisualViewportTop = Math.round(visualViewportOffsetTop || 0);
  const mobileViewportStyle = useMemo(
    () => ({
      top: `${resolvedVisualViewportTop}px`,
      height: resolvedVisualViewportHeight ? `${resolvedVisualViewportHeight}px` : "100dvh",
    }),
    [resolvedVisualViewportTop, resolvedVisualViewportHeight],
  );
  const dragDismissThreshold = useMemo(() => {
    const height = resolvedVisualViewportHeight || visualHeightFallback || 0;
    if (!height) return 140;
    return Math.min(260, Math.max(120, Math.round(height * 0.25)));
  }, [resolvedVisualViewportHeight, visualHeightFallback]);
  const maxDragOffset = useMemo(() => {
    const height = resolvedVisualViewportHeight || visualHeightFallback || 0;
    if (!height) return 360;
    return Math.max(320, Math.round(height * 0.6));
  }, [resolvedVisualViewportHeight, visualHeightFallback]);
  const overlayOpacity = useMemo(() => {
    if (isKeyboardMode) return 1;
    if (!maxDragOffset) return 1;
    const progress = Math.min(sheetOffsetY / maxDragOffset, 1);
    return 1 - progress * 0.35;
  }, [isKeyboardMode, sheetOffsetY, maxDragOffset]);

  useEffect(() => {
    sheetOffsetRef.current = sheetOffsetY;
  }, [sheetOffsetY]);

  useEffect(() => {
    if (dragCloseTimeoutRef.current) {
      clearTimeout(dragCloseTimeoutRef.current);
      dragCloseTimeoutRef.current = null;
    }
    if (!open || isKeyboardMode) {
      setSheetOffsetY(0);
      sheetOffsetRef.current = 0;
      setSheetDragging(false);
      sheetDragStateRef.current = null;
    }
  }, [open, isKeyboardMode]);

  const handleSheetDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isKeyboardMode) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      sheetDragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastTime: event.timeStamp || Date.now(),
      };
      setSheetDragging(true);
    },
    [isKeyboardMode],
  );

  const handleSheetDragPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!sheetDragging) return;
      const state = sheetDragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const delta = Math.max(0, event.clientY - state.startY);
      const clamped = Math.min(delta, maxDragOffset);
      sheetOffsetRef.current = clamped;
      setSheetOffsetY(clamped);
      state.lastY = event.clientY;
      state.lastTime = event.timeStamp || Date.now();
    },
    [sheetDragging, maxDragOffset],
  );

  const handleSheetDragPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!sheetDragging) return;
      const state = sheetDragStateRef.current;
      sheetDragStateRef.current = null;
      setSheetDragging(false);

      const lastTime = state?.lastTime ?? event.timeStamp ?? Date.now();
      const lastY = state?.lastY ?? event.clientY;
      const elapsed = Math.max(1, (event.timeStamp || Date.now()) - lastTime);
      const velocity = (event.clientY - lastY) / elapsed;

      const shouldDismiss = sheetOffsetRef.current > dragDismissThreshold || velocity > 0.6;

      if (dragCloseTimeoutRef.current) {
        clearTimeout(dragCloseTimeoutRef.current);
      }

      if (shouldDismiss) {
        setSheetOffsetY(maxDragOffset);
        sheetOffsetRef.current = maxDragOffset;
        dragCloseTimeoutRef.current = setTimeout(() => {
          setSheetOffsetY(0);
          sheetOffsetRef.current = 0;
          handleOpenChange(false);
        }, 180);
      } else {
        setSheetOffsetY(0);
        sheetOffsetRef.current = 0;
        dragCloseTimeoutRef.current = null;
      }
    },
    [sheetDragging, dragDismissThreshold, maxDragOffset, handleOpenChange],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!open || !isMobile) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      handleOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isMobile, handleOpenChange]);

  const triggerButton = compactTrigger ? (
    <button
      type="button"
      className={cn(
        "relative inline-flex h-(--nav-icon-size) w-(--nav-icon-size) items-center justify-center bg-transparent p-0 text-current transition active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:text-brand",
        triggerClassName,
      )}
      aria-label={strings.label}
      aria-expanded={open}
      data-state={open ? "open" : "closed"}
      onClick={isMobile ? () => handleOpenChange(!open) : undefined}
    >
      {triggerIcon ? (
        <span className="inline-flex h-full w-full items-center justify-center">
          {triggerIcon}
        </span>
      ) : (
        <MessageCircle className="h-full w-full" strokeWidth={1.6} />
      )}
      {indicator}
    </button>
  ) : (
    <button
      type="button"
      className={cn(chipClass, triggerClassName)}
      aria-label={strings.label}
      aria-expanded={open}
      data-state={open ? "open" : "closed"}
      onClick={isMobile ? () => handleOpenChange(!open) : undefined}
    >
      {triggerIcon ? (
        <span className="inline-flex items-center justify-center">{triggerIcon}</span>
      ) : (
        <MessageCircle className="h-6 w-6" strokeWidth={1.6} />
      )}
      {indicator}
    </button>
  );

  if (isMobile) {
    const overlay = open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed left-0 right-0 z-[100]"
            style={mobileViewportStyle}
            dir={isRtl ? "rtl" : "ltr"}
            role="dialog"
            aria-modal="true"
            aria-label={strings.label}
          >
            <div
              className={cn("absolute inset-0", isKeyboardMode ? "bg-black/35" : "bg-black/15")}
              style={{ opacity: overlayOpacity }}
              aria-hidden
              onPointerDown={() => handleOpenChange(false)}
            />
            <div
              className="relative flex h-full w-full justify-center"
              style={{
                paddingTop: isKeyboardMode ? 0 : mobileTopPaddingPx,
                paddingBottom: isKeyboardMode ? 0 : mobileBottomPaddingPx,
              }}
            >
              <div
                className={cn(
                  "relative flex h-full w-full flex-col overflow-hidden",
                  sheetDragging ? "transition-none" : "transition-transform duration-200 ease-out",
                  isKeyboardMode
                    ? "bg-white/95 backdrop-blur-xl"
                    : "w-[min(960px,calc(100vw-1.5rem))] rounded-[32px] border border-white/50 bg-linear-to-br from-white/85 via-white/70 to-primary/10 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-2xl ring-1 ring-white/40",
                )}
                style={{
                  transform: isKeyboardMode ? "none" : `translateY(${Math.round(sheetOffsetY)}px)`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {!isKeyboardMode && (
                  <div
                    className="flex w-full justify-center pb-2 pt-1 touch-none"
                    onPointerDown={handleSheetDragPointerDown}
                    onPointerMove={handleSheetDragPointerMove}
                    onPointerUp={handleSheetDragPointerEnd}
                    onPointerCancel={handleSheetDragPointerEnd}
                    onLostPointerCapture={handleSheetDragPointerEnd}
                  >
                    <div className="h-1.5 w-12 rounded-full bg-[#D9C4AF]/80" aria-hidden />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className={cn(
                    "absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#2D2D2D] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
                    isKeyboardMode
                      ? "bg-black/5 hover:bg-black/10"
                      : "border border-[#eadbc5]/70 bg-white/80 shadow-sm hover:bg-white hover:text-brand hover:border-brand/40",
                  )}
                  aria-label={strings.label}
                >
                  <X className="h-4 w-4" />
                </button>

                <div className={cn("min-h-0 flex-1", !isKeyboardMode && "pt-2")}>
                  {!canLoad ? (
                    <div className="relative flex h-full w-full items-center justify-center rounded-[24px] px-6 text-center text-sm text-[#777777]">
                      {strings.loginRequired}
                    </div>
                  ) : (
                    <div className={cn("h-full w-full", !isKeyboardMode && "p-1")}>
                      {mobileView === "list" ? (
                        <div className="h-full w-full" style={{ height: isKeyboardMode ? "100%" : mobileCardHeight }}>
                          {renderConversationListSection()}
                        </div>
                      ) : (
                        <div className="h-full w-full" style={{ height: isKeyboardMode ? "100%" : mobileCardHeight }}>
                          {renderConversationThreadSection(true)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

    return (
      <>
        {triggerButton}
        {overlay}
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverAnchor asChild>
        <div
          className="fixed left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ top: 56 }}
          aria-hidden
        />
      </PopoverAnchor>

      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={12}
        dir={isRtl ? "rtl" : "ltr"}
        forceMount
        className={cn(
          "group relative z-90 w-[960px] max-w-[min(1100px,calc(100vw-1.5rem))] border-none bg-transparent p-0 shadow-none ring-0",
        )}
      >
        <div
          ref={sheetRef}
          className={cn(
            "relative rounded-[32px] border border-white/50 bg-linear-to-br from-white/85 via-white/70 to-primary/10 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-2xl ring-1 ring-white/40 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "data-[state=closed]:[--ku-sheet-enter:-48px] data-[state=open]:[--ku-sheet-enter:0px]",
            "group-data-[state=closed]:opacity-0 group-data-[state=open]:opacity-100",
            isRtl ? "text-right" : "text-left",
          )}
          style={{ transform: "translateY(var(--ku-sheet-enter, 0px))" }}
        >
            {!canLoad ? (
              <div className="relative flex h-[380px] w-full items-center justify-center rounded-[24px] px-6 text-center text-sm text-[#777777]">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#eadbc5]/70 bg-white/80 text-[#2D2D2D] shadow-sm transition hover:bg-white hover:text-brand hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  aria-label={strings.label}
                >
                  <X className="h-4 w-4" />
                </button>
                {strings.loginRequired}
              </div>
            ) : (
              <div className="relative mx-auto flex w-full flex-col gap-4 p-1 md:flex-row">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#eadbc5]/70 bg-white/80 text-[#2D2D2D] shadow-sm transition hover:bg-white hover:text-brand hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  aria-label={strings.label}
                >
                  <X className="h-4 w-4" />
                </button>
                {isMobile ? (
                  mobileView === "list" ? (
                    <div className="w-full" style={{ height: cardHeight }}>
                      {renderConversationListSection()}
                    </div>
                  ) : (
                    <div className="w-full" style={{ height: cardHeight }}>
                      {renderConversationThreadSection(true)}
                    </div>
                  )
                ) : (
                  <>
                    <div className="w-[35%] min-w-[240px]" style={{ height: cardHeight }}>
                      {renderConversationListSection()}
                    </div>
                    <div className="flex-1" style={{ height: cardHeight }}>
                      {renderConversationThreadSection(false)}
                    </div>
                  </>
                )}
              </div>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
