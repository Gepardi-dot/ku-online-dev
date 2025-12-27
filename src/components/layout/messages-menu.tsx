"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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
  listConversationsForUser,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  subscribeToIncomingMessages,
  type ConversationSummary,
  type MessageRecord,
} from "@/lib/services/messages-client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";

const clampValue = (input: number, min: number, max: number) => Math.min(max, Math.max(min, input));
const MOBILE_BOTTOM_GAP_PX = 92; // Increased spacing to ensure sheet clears mobile nav

interface DragState {
  active: boolean;
  startY: number;
  startOffset: number;
}

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
  const { locale } = useLocale();

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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const conversationsRef = useRef<ConversationSummary[]>([]);
  const dragStateRef = useRef<DragState>({ active: false, startY: 0, startOffset: 0 });
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const canLoad = Boolean(userId);

  // --- Layout / viewport ---

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const width = window.innerWidth || 0;
      const isSmallViewport = width < 768;
      setIsMobile(isSmallViewport);

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

      const viewportHeight = window.innerHeight || 0;
      const navHeight = mobileNav ? mobileNav.getBoundingClientRect().height : 0;

      // On mobile we want the sheet to sit just above
      // the bottom navigation bar with a small gap, while
      // on larger screens we keep a bit more breathing room.
      const extraGap = isSmallViewport ? MOBILE_BOTTOM_GAP_PX : 24;
      let available = viewportHeight - offsetTop - navHeight - extraGap;

      // Clamp the card height so it stays elegant on all screens.
      if (!Number.isFinite(available) || available <= 0) {
        available = 420;
      }
      const minHeight = isSmallViewport ? 440 : 320;
      const maxHeight = isSmallViewport ? Math.min(640, viewportHeight - offsetTop - extraGap) : 420;
      const clamped = Math.max(minHeight, Math.min(maxHeight, available));

      setCardOffsetTop(offsetTop);
      setCardHeight(clamped);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6d6d6]/80 bg-gradient-to-b from-[#fbfbfb] to-[#f1f1f1] text-[#1F1C1C] shadow-sm transition hover:border-brand/50 hover:text-brand hover:shadow-[0_10px_26px_rgba(120,72,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/40";

  const minDragOffset = useMemo(() => {
    if (!isMobile) return 0;
    const availableLift = Math.max(cardOffsetTop - 12, 0);
    const minimumLift = 80;
    return -Math.max(availableLift, minimumLift);
  }, [isMobile, cardOffsetTop]);

  useEffect(() => {
    setDragOffset((current) => clampValue(current, minDragOffset, 0));
  }, [minDragOffset]);

  useEffect(() => {
    if (!open) {
      dragStateRef.current.active = false;
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [open]);

  useEffect(() => {
    if (!isMobile) {
      dragStateRef.current.active = false;
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!open || !isMobile) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.active) return;
      const delta = event.clientY - dragStateRef.current.startY;
      const next = clampValue(dragStateRef.current.startOffset + delta, minDragOffset, 0);
      setDragOffset(next);
    };

    const stopDragging = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [open, isMobile, minDragOffset]);

  useEffect(() => {
    if (!open || !isMobile) return;
    if (typeof window === "undefined") return;
    if (!sheetRef.current) return;

    const viewportHeight = window.innerHeight || 0;
    const mobileNav = document.querySelector<HTMLElement>("[data-mobile-nav]");
    const navHeight = mobileNav ? mobileNav.getBoundingClientRect().height : 0;
    const maxBottom = viewportHeight - navHeight - MOBILE_BOTTOM_GAP_PX;

    const rect = sheetRef.current.getBoundingClientRect();
    const overshoot = rect.bottom - maxBottom;

    if (Math.abs(overshoot) < 1) return;

    setDragOffset((current) => clampValue(current - overshoot, minDragOffset, 0));
  }, [open, isMobile, minDragOffset]);

  // --- Event handlers ---

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({ title: strings.loginRequired });
          return;
        }
        setMobileView("list");
        // On mobile, start with a negative offset to lift the window
        // above the bottom navigation bar by default.
        const initialOffset = isMobile ? -50 : 0;
        setDragOffset(initialOffset);
        dragStateRef.current.active = false;
        setIsDragging(false);
        setOpen(true);
      } else {
        dragStateRef.current.active = false;
        setDragOffset(0);
        setIsDragging(false);
        setOpen(false);
      }
    },
    [canLoad, strings.loginRequired, isMobile],
  );

  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
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
  }, [activeConversation, userId, draft, sending]);

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

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragStateRef.current = {
        active: true,
        startY: event.clientY,
        startOffset: dragOffset,
      };
      setIsDragging(true);
    },
    [isMobile, dragOffset],
  );

  // --- Render helpers ---

  const renderConversationSummary = (conversation: ConversationSummary) => {
    const isActive = conversation.id === activeConversationId;
    const isUnread = conversation.hasUnread;

    const lastActivity = conversation.lastMessageAt
      ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
      : null;

    const target = conversation.sellerId === userId ? conversation.buyer : conversation.seller;
    const targetName = target?.fullName?.trim() || target?.id || "Unknown user";
    const avatarLetter = targetName.charAt(0).toUpperCase() || "U";
    const avatarUrl = target?.avatarUrl ?? null;

    const preview = conversation.lastMessage ?? "";

    return (
      <div
        key={conversation.id}
        className={cn(
          "flex w-full items-center gap-3 rounded-3xl border p-3 text-left text-sm shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md active:translate-y-0",
          isActive
            ? "border-brand/40 bg-[#FFF8F0]/90 shadow-md ring-1 ring-brand/20"
            : isUnread
              ? "border-brand/30 bg-[#FFF3E6]/90 shadow-md ring-1 ring-brand/15 hover:bg-[#FFEDD8]/95"
              : "border-[#eadbc5]/60 bg-[#FFFBF5]/80 ring-1 ring-black/[0.03] hover:border-brand/30 hover:bg-[#FFF8F0]/90",
        )}
      >
        <button
          type="button"
          onClick={() => handleConversationSelect(conversation.id)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl ?? undefined} alt={targetName} />
            <AvatarFallback className="bg-[#F6ECE0] text-[#2D2D2D]">{avatarLetter}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 items-start justify-between gap-2">
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm text-[#2D2D2D]",
                  isUnread ? "font-semibold" : "font-medium",
                )}
              >
                {target?.fullName ?? target?.id?.slice(0, 8) ?? "Unknown user"}
              </p>
              {preview && (
                <p
                  className={cn(
                    "mt-0.5 line-clamp-1 text-xs",
                    isUnread ? "text-[#2D2D2D]" : "text-[#777777]",
                  )}
                >
                  {preview}
                </p>
              )}
            </div>
            <div className="ml-2 flex items-center gap-2">
              {lastActivity && <p className="text-[11px] text-[#777777]">{lastActivity}</p>}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => void handleDeleteConversation(conversation.id)}
          aria-label="Delete conversation"
          className="ml-1 text-brand hover:text-[#c76a16]"
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

    return (
      <div className="space-y-3">
        {hasMore && oldestCursor && (
          <div className="flex justify-center">
            <button
              type="button"
              className="text-[11px] text-brand underline-offset-2 hover:underline"
              onClick={handleLoadMore}
              disabled={loadingMessages}
            >
              {loadingMessages ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {messages.map((message) => {
          const isViewer = message.senderId === userId;
          const timestamp = formatDistanceToNow(new Date(message.createdAt), {
            addSuffix: true,
          });

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
                  "max-w-[70%] rounded-[16px] px-3.5 py-1.5 text-sm shadow-sm",
                  isViewer
                    ? "bg-brand text-white"
                    : "bg-[#EBDAC8] text-[#2D2D2D]",
                )}
              >
                <p className="whitespace-pre-line">{message.content}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-[#777777]">
                {timestamp}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderConversationListSection = () => (
    <div className="flex h-full flex-col rounded-[32px] border border-white/60 bg-gradient-to-br from-white/30 via-white/20 to-white/5 !bg-transparent p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40">
      <div className="flex items-center justify-between px-3 py-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-brand">Contacts</span>
      </div>
      <ScrollArea className="flex-1 pr-1">
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
              className="mr-2 inline-flex items-center gap-1 text-xs text-brand hover:underline md:hidden"
              onClick={() => setMobileView("list")}
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back</span>
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
                    No image
                  </div>
                )}
              </Link>
            )}
            <div className="flex flex-col">
              <p className="text-sm font-semibold text-[#2D2D2D]">
                {counterpart?.fullName ? `Chat with ${counterpart.fullName}` : "Chat"}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-[#777777]">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                <span>Status</span>
                <span className="text-[#C4A98A]">{"\u00B7"}</span>
                <span>On</span>
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
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {compactTrigger ? (
          <button
            type="button"
            className={cn(
              "relative inline-flex h-[var(--nav-icon-size)] w-[var(--nav-icon-size)] items-center justify-center bg-transparent p-0 text-current",
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
        <div className="fixed left-1/2 top-[56px] -translate-x-1/2 pointer-events-none" aria-hidden />
      </PopoverAnchor>

      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={12}
        className="relative z-[90] w-[960px] max-w-[min(1100px,calc(100vw-1.5rem))] border-none bg-transparent p-0 shadow-none ring-0"
      >
        <div
          ref={sheetRef}
          className="relative rounded-[32px] border border-white/50 bg-gradient-to-br from-white/85 via-white/70 to-primary/10 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-2xl ring-1 ring-white/40"
          style={{
            transform: `translateY(${dragOffset}px)`,
            transition: isDragging ? "none" : "transform 180ms ease-out",
          }}
        >
          {isMobile && (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
              <div
                role="presentation"
                aria-hidden="true"
                onPointerDown={handleDragStart}
                className="pointer-events-auto h-1.5 w-16 cursor-grab rounded-full bg-[#D9C4AF]/80 touch-none select-none transition active:cursor-grabbing"
              />
            </div>
          )}
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
