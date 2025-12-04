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
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import BrandLogo from "@/components/brand-logo";
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
  const [topOffset, setTopOffset] = useState<number | null>(null);
  const [cardHeight, setCardHeight] = useState<number>(420);

  const conversationsRef = useRef<ConversationSummary[]>([]);

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

      // Reserve some extra gap above the nav so the card
      // never visually collides with it.
      const extraGap = isSmallViewport ? 8 : 24;
      let available = viewportHeight - offsetTop - navHeight - extraGap;

      // Clamp the card height so it stays elegant on all screens.
      if (!Number.isFinite(available) || available <= 0) {
        available = 420;
      }
      const minHeight = isSmallViewport ? 440 : 320;
      const maxHeight = isSmallViewport ? Math.min(640, viewportHeight - offsetTop - extraGap) : 420;
      const clamped = Math.max(minHeight, Math.min(maxHeight, available));

      setTopOffset(offsetTop);
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

      if (results.length > 0) {
        setActiveConversationId((previous) => previous ?? results[0].id);
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
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
            conversation.id === conversationId ? { ...conversation, hasUnread: false } : conversation,
          ),
        );

        const newlyRead = history.filter(
          (item) => !item.isRead && item.receiverId === userId,
        ).length;
        if (newlyRead > 0) {
          setUnreadCount((previous) => Math.max(0, previous - newlyRead));
        }
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
    [userId, oldestCursor],
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

        const updated: ConversationSummary = {
          ...existing,
          lastMessage: message.content,
          lastMessageAt: message.createdAt,
          hasUnread: shouldFlagUnread ? true : false,
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
            const summaryWithUnread = shouldFlagUnread ? { ...summary, hasUnread: true } : summary;

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
          setUnreadCount((previous) => Math.max(0, previous - 1));
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
      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-[#E67E22] px-1 text-[10px] font-semibold text-white shadow-sm">
        {displayCount}
      </span>
    );
  }, [unreadCount]);
  const chipClass =
    "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E4E4E4] bg-white text-[#1F1C1C] transition hover:border-[#E67E22] hover:text-[#E67E22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/50 focus-visible:ring-offset-2";

  // --- Event handlers ---

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (!canLoad) {
          toast({ title: strings.loginRequired });
          return;
        }
        setMobileView("list");
        setOpen(true);
      } else {
        setOpen(false);
      }
    },
    [canLoad, strings.loginRequired],
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
      toast({
        title: "Message not sent",
        description: "Please try sending your message again.",
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

  // --- Render helpers ---

  const renderConversationSummary = (conversation: ConversationSummary) => {
    const isActive = conversation.id === activeConversationId;
    const isUnread = conversation.hasUnread;

    const lastActivity = conversation.lastMessageAt
      ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
      : null;

    const target = conversation.sellerId === userId ? conversation.buyer : conversation.seller;
    const avatarLetter = target?.fullName ? target.fullName[0] : "U";

    const preview = conversation.lastMessage ?? "";

    return (
      <div
        key={conversation.id}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm shadow-sm transition",
          isActive
            ? "border-[#E7C9A3] bg-[rgba(231,201,163,0.35)]"
            : isUnread
              ? "border-[#F3C78A] bg-[rgba(243,199,138,0.25)]"
              : "border-transparent bg-[rgba(255,255,255,0.24)] hover:bg-[rgba(255,255,255,0.4)]",
        )}
      >
        <button
          type="button"
          onClick={() => handleConversationSelect(conversation.id)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback>{avatarLetter}</AvatarFallback>
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
            {lastActivity && (
              <p className="ml-2 text-[11px] text-[#777777]">{lastActivity}</p>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={() => void handleDeleteConversation(conversation.id)}
          aria-label="Delete conversation"
          className="ml-1 text-[#E67E22] hover:text-[#c76a16]"
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
              className="text-[11px] text-[#E67E22] underline-offset-2 hover:underline"
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
                    ? "bg-[#E67E22] text-white"
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
    <div className="flex h-full flex-col rounded-[24px] border border-white/60 bg-[rgba(255,249,217,0.28)] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-md">
      <div className="mb-4 flex items-center justify-start">
        <span className="text-base font-semibold text-[#2D2D2D]">Contacts</span>
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
          <div className="space-y-2">
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
        <div className="flex items-center gap-2 border-b border-[#D9C4AF] px-5 py-3">
          {showBackButton && (
            <button
              type="button"
              className="mr-2 inline-flex items-center gap-1 text-xs text-[#E67E22] hover:underline md:hidden"
              onClick={() => setMobileView("list")}
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back</span>
            </button>
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

        {product && (
          <div className="border-b border-[#D9C4AF] bg-transparent px-5 py-3">
            <Link
              href={`/product/${product.id}`}
              className="inline-flex items-center gap-3 rounded-2xl border border-[#D9C4AF] bg-[rgba(255,250,245,0.85)] px-3 py-2 shadow-sm"
            >
              <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-[#EBDAC8]">
                {productImageSrc ? (
                  <Image
                    src={productImageSrc}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-[#777777]">
                    No image
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="line-clamp-1 text-sm font-semibold text-[#2D2D2D]">
                  {product.title}
                </p>
                <p className="line-clamp-1 text-xs text-[#E67E22]">
                  {typeof product.price === "number"
                    ? `${product.price.toLocaleString(locale)} ${product.currency ?? "IQD"}`
                    : product.currency ?? null}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#777777]" />
            </Link>
          </div>
        )}

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
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E67E22] text-white shadow-md disabled:opacity-60"
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

  // --- Render root dialog ---

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
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
      </DialogTrigger>

      <DialogContent className="!top-0 !left-0 !h-screen !w-full !max-w-none !translate-x-0 !translate-y-0 !border-none !bg-transparent !p-0 !shadow-none flex items-start justify-center">
        <DialogTitle className="sr-only">{strings.label}</DialogTitle>
        <div
          className="relative flex min-h-[380px] w-full max-w-5xl items-start justify-center px-4 pb-6 sm:px-6"
          style={{ paddingTop: Math.max(0, ((topOffset ?? 120) + 8 - 24)) }}
        >
          {/* Soft glow behind card */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[70vh] w-[70vw] rounded-full bg-white/15 blur-3xl" />
          </div>

          {/* KU-ONLINE watermark logo */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <BrandLogo size={640} />
          </div>

          {/* Glass card */}
          {!canLoad ? (
            <div className="relative z-10 flex h-[380px] w-full max-w-5xl items-center justify-center rounded-[32px] border border-white/60 bg-[rgba(255,250,245,0.35)] px-6 text-center text-sm text-[#777777] shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur">
              <DialogClose
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,250,245,0.95)] text-[#2D2D2D] shadow-[0_10px_30px_rgba(15,23,42,0.25)] transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label={strings.label}
              >
                <X className="h-4 w-4" />
              </DialogClose>
              {strings.loginRequired}
            </div>
          ) : (
            <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col rounded-[32px] border border-white/60 bg-[rgba(255,250,245,0.35)] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur md:flex-row md:gap-4">
              <DialogClose
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,250,245,0.95)] text-[#2D2D2D] shadow-[0_10px_30px_rgba(15,23,42,0.25)] transition hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E67E22]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label={strings.label}
              >
                <X className="h-4 w-4" />
              </DialogClose>
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
                  <div className="w-[35%] min-w-[220px]" style={{ height: cardHeight }}>
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
      </DialogContent>
    </Dialog>
  );
}
