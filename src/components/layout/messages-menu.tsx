"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MessageCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, ckb, enUS } from "date-fns/locale";
import Link from "next/link";
import Image from "next/image";

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  countUnreadMessages,
  deleteConversation,
  fetchConversation,
  fetchMessages,
  listConversationsForUser,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  subscribeToIncomingMessages,
  type ConversationSummary,
  type MessageRecord,
} from "@/lib/services/messages-client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import { rtlLocales } from "@/lib/locale/dictionary";

const MOBILE_BOTTOM_GAP_PX = 24; // Breathing room above the mobile nav
const MOBILE_TOP_GAP_PX = 16;
const POPOVER_SIDE_OFFSET_PX = 12;
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [cardHeight, setCardHeight] = useState<number>(420);
  const [cardOffsetTop, setCardOffsetTop] = useState<number>(56);

  const conversationsRef = useRef<ConversationSummary[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canLoad = Boolean(userId);

  // --- Layout / viewport ---

  const updateLayout = useCallback(() => {
    if (typeof window === "undefined") return;
    const width = window.innerWidth || 0;
    const isSmallViewport = width < 768;
    setIsMobile(isSmallViewport);

    if (isSmallViewport) {
      setCardOffsetTop(0);
      setCardHeight(0);
      return;
    }

    const announcement = document.querySelector<HTMLElement>("[data-announcement-bar]");
    const header = document.getElementById("ku-main-header");

    let offsetTop = 16;
    if (announcement) {
      offsetTop += announcement.getBoundingClientRect().height;
    }
    if (header) {
      offsetTop += header.getBoundingClientRect().height;
    }

    const viewportHeight = window.innerHeight || 0;
    let available = viewportHeight - offsetTop - 24;
    if (!Number.isFinite(available) || available <= 0) {
      available = 420;
    }

    const minHeight = 320;
    const maxHeight = Math.min(420, available);
    const clamped = Math.max(minHeight, Math.min(maxHeight, available));

    setCardOffsetTop(offsetTop);
    setCardHeight(clamped);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("orientationchange", updateLayout);

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("orientationchange", updateLayout);
    };
  }, [updateLayout]);

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

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    setLoadingConversations(true);
    try {
      const results = await listConversationsForUser(userId);
      setConversations(results);

      setActiveConversationId((previous) => {
        if (!previous) return null;
        return results.some((conversation) => conversation.id === previous) ? previous : null;
      });
    } catch (error) {
      console.error("Failed to load conversations", error);
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
      } catch (error) {
        console.error("Failed to load messages", error);
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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    if (!open || !isMobile || mobileView !== "thread") return;
    window.requestAnimationFrame(() => scrollToBottom("auto"));
  }, [open, isMobile, mobileView, scrollToBottom]);

  useEffect(() => {
    if (!open || !isMobile || mobileView !== "thread") return;
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleViewportResize = () => {
      window.requestAnimationFrame(() => scrollToBottom("auto"));
    };

    viewport.addEventListener("resize", handleViewportResize);
    viewport.addEventListener("scroll", handleViewportResize);
    return () => {
      viewport.removeEventListener("resize", handleViewportResize);
      viewport.removeEventListener("scroll", handleViewportResize);
    };
  }, [open, isMobile, mobileView, scrollToBottom]);

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

  const mobileContentStyle = isMobile
    ? {
        position: "fixed",
        top: `calc(var(--app-header-offset) + ${MOBILE_TOP_GAP_PX}px)`,
        bottom: `calc(var(--mobile-nav-offset) + var(--mobile-keyboard-offset) + ${MOBILE_BOTTOM_GAP_PX}px)`,
        left: 0,
        right: 0,
        marginLeft: "auto",
        marginRight: "auto",
        width: "min(1100px, calc(100vw - 1.5rem))",
        transform: "none",
      }
    : undefined;


  // --- Event handlers ---

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({ title: strings.loginRequired, variant: "brand" });
        }
        updateLayout();
        setMobileView("list");
        setOpen(true);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ku-menu-open", { detail: { source: "messages-menu" } }));
        }
      } else {
        setOpen(false);
      }
    },
    [canLoad, strings.loginRequired, updateLayout],
  );

  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
      if (open) {
        void loadMessages(conversationId);
      }
      if (isMobile) {
        setMobileView("thread");
        window.requestAnimationFrame(() => scrollToBottom("auto"));
      }
    },
    [open, loadMessages, isMobile, scrollToBottom],
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
      if (isMobile) {
        window.requestAnimationFrame(() => scrollToBottom("smooth"));
      }
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
  }, [activeConversation, userId, draft, sending, isMobile, scrollToBottom]);

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
        key={conversation.id}
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

    const orderedMessages = [...messages].reverse();

    return (
      <div className="space-y-3">
        {orderedMessages.map((message) => {
          const isViewer = message.senderId === userId;
          const timestamp = formatRelativeTime(new Date(message.createdAt));
          const messageIsArabic = hasArabicScript(message.content);

          return (
            <div
              key={message.id}
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
          );
        })}
        {hasMore && oldestCursor && (
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
        )}
        <div ref={messagesEndRef} />
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
      <ScrollArea className={cn("flex-1", isRtl ? "pl-1" : "pr-1")}>
        {loadingConversations ? (
          <div className="flex h-full items-center justify-center text-[#777777]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[#777777]">
            {strings.empty}
          </p>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation) => renderConversationSummary(conversation))}
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
      <div className="flex h-full flex-col rounded-[24px] bg-transparent">
        <div className="flex items-center gap-3 border-b border-[#D9C4AF] px-5 py-3">
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

        <ScrollArea className="flex-1 px-5 py-4">
          {renderMessages()}
        </ScrollArea>

        <div className="border-t border-[#EBDAC8] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-full bg-[#f5f5f5] px-1.5 py-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={strings.typePlaceholder}
                className="h-10 rounded-full border border-[#e3e3e3] bg-white px-4 text-sm text-[#2D2D2D] placeholder:text-[#777777] focus-visible:ring-0"
                onFocus={() => {
                  if (!isMobile) return;
                  window.requestAnimationFrame(() => scrollToBottom("smooth"));
                }}
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

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        {compactTrigger ? (
          <button
            type="button"
            className={cn(
              "relative inline-flex h-(--nav-icon-size) w-(--nav-icon-size) items-center justify-center bg-transparent p-0 text-current transition active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:text-brand",
              triggerClassName,
            )}
            aria-label={strings.label}
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
          >
            {triggerIcon ? (
              <span className="inline-flex items-center justify-center">{triggerIcon}</span>
            ) : (
              <MessageCircle className="h-6 w-6" strokeWidth={1.6} />
            )}
            {indicator}
          </button>
        )}
      </PopoverTrigger>
      <PopoverAnchor asChild>
        <div
          className="fixed left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ top: isMobile ? 0 : cardOffsetTop }}
          aria-hidden
        />
      </PopoverAnchor>

      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={isMobile ? 0 : POPOVER_SIDE_OFFSET_PX}
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "relative z-90 border-none bg-transparent p-0 shadow-none ring-0",
          isMobile ? "w-full max-w-none" : "w-[960px] max-w-[min(1100px,calc(100vw-1.5rem))]",
        )}
        style={mobileContentStyle}
      >
        <div
          className={cn(
            "relative rounded-[32px] border border-white/50 bg-linear-to-br from-white/85 via-white/70 to-primary/10 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-2xl ring-1 ring-white/40",
            isMobile && "h-full",
            isRtl ? "text-right" : "text-left",
          )}
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
                  <div className="w-full h-full">
                    {renderConversationListSection()}
                  </div>
                ) : (
                  <div className="w-full h-full">
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
