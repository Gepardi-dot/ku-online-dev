"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Loader2, Send } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  fetchMessages,
  fetchConversation,
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

interface ProfileMessagesProps {
  userId: string;
}

export default function ProfileMessages({ userId }: ProfileMessagesProps) {
  const { messages, t, locale } = useLocale();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesState, setMessagesState] = useState<MessageRecord[]>([]);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");

  const conversationsRef = useRef<ConversationSummary[]>([]);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [messageTranslations, setMessageTranslations] = useState<
    Record<
      string,
      {
        translated?: string;
        loading: boolean;
        showing: boolean;
      }
    >
  >({});

  const strings = {
    emptyConversations: messages.header.messagesEmpty,
    emptyMessages: messages.header.messagesEmpty,
    typePlaceholder: messages.header.typeMessage,
    send: messages.header.sendMessage,
  };

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setActiveConversationId(null);
      setMessagesState([]);
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
        setMessagesState([]);
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
        setMessagesState([]);
        setOldestCursor(null);
        setHasMore(false);
        return;
      }

      setLoadingMessages(true);
      try {
        const history = await fetchMessages(conversationId, { limit: 60, before: options?.before });
        setMessagesState((previous) => (options?.append ? [...history, ...previous] : history));
        const oldest = history[0]?.createdAt ?? null;
        setOldestCursor(options?.append ? oldest ?? oldestCursor : oldest);
        setHasMore(history.length >= 60);
        await markConversationRead(conversationId, userId);
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, hasUnread: false } : conversation,
          ),
        );
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

  useEffect(() => {
    if (!userId) {
      return;
    }
    void loadConversations();
  }, [userId, loadConversations]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = subscribeToIncomingMessages(userId, (message) => {
      const shouldFlagUnread = message.conversationId !== activeConversationId;

      setConversations((previous) => {
        const existing = previous.find((item) => item.id === message.conversationId);
        if (!existing) {
          return previous;
        }
        const updated = {
          ...existing,
          lastMessage: message.content,
          lastMessageAt: message.createdAt,
          hasUnread: shouldFlagUnread ? true : false,
        };
        const others = previous.filter((item) => item.id !== message.conversationId);
        return [updated, ...others];
      });

      if (!conversationsRef.current.some((conversation) => conversation.id === message.conversationId)) {
        fetchConversation(message.conversationId)
          .then((summary) => {
            if (!summary) {
              return;
            }
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
  }, [userId, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessagesState([]);
      setOldestCursor(null);
      setHasMore(false);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    setDraft("");
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !userId) {
      return;
    }

    const channel = subscribeToConversation(activeConversationId, async (message) => {
      setMessagesState((previous) => {
        if (previous.some((item) => item.id === message.id)) {
          return previous;
        }
        return [...previous, message];
      });

      if (message.receiverId === userId) {
        try {
          await markConversationRead(activeConversationId, userId);
        } catch (error) {
          console.error("Failed to mark message read", error);
        }
      }

      setConversations((previous) => {
        const existing = previous.find((item) => item.id === message.conversationId);
        if (!existing) {
          return previous;
        }
        const updated = {
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
  }, [activeConversationId, userId]);

  const handleToggleTranslation = useCallback(
    async (message: MessageRecord) => {
      setMessageTranslations((previous) => {
        const existing = previous[message.id];
        if (existing && existing.translated && !existing.loading) {
          return {
            ...previous,
            [message.id]: { ...existing, showing: !existing.showing },
          };
        }
        return {
          ...previous,
          [message.id]: { translated: existing?.translated, loading: true, showing: true },
        };
      });

      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: message.content,
            targetLocale: locale,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          translatedText?: string;
        };
        if (!response.ok || typeof data.translatedText !== "string") {
          throw new Error("Failed to translate");
        }
        setMessageTranslations((previous) => ({
          ...previous,
          [message.id]: {
            translated: data.translatedText,
            loading: false,
            showing: true,
          },
        }));
      } catch (error) {
        console.error("Failed to translate message", error);
        toast({
          title: "Translation unavailable",
          description: "We could not translate this message. Please try again shortly.",
          variant: "destructive",
        });
        setMessageTranslations((previous) => ({
          ...previous,
          [message.id]: {
            translated: previous[message.id]?.translated,
            loading: false,
            showing: false,
          },
        }));
      }
    },
    [locale],
  );

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const counterpart = useMemo(() => {
    if (!activeConversation || !userId) {
      return null;
    }
    if (activeConversation.sellerId === userId) {
      return activeConversation.buyer;
    }
    return activeConversation.seller;
  }, [activeConversation, userId]);

  const product = activeConversation?.product ?? null;
  const productImageSrc =
    product?.imageUrls?.find((url) => typeof url === "string" && url.trim().length > 0) ?? null;

  const handleConversationSelect = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!activeConversation || !userId || sending) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

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

      setMessagesState((previous) => {
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

  const renderConversationSummary = useCallback(
    (conversation: ConversationSummary) => {
      const isActive = conversation.id === activeConversationId;
      const isUnread = conversation.hasUnread;
      const lastActivity = conversation.lastMessageAt
        ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
        : null;
      const target = conversation.sellerId === userId ? conversation.buyer : conversation.seller;
      const avatarLetter = target?.fullName ? target.fullName[0] : "U";
      const productTitle = conversation.product?.title ?? null;
      const productPrice =
        typeof conversation.product?.price === "number" ? conversation.product.price : null;
      const productCurrency = conversation.product?.currency ?? "IQD";

      return (
        <button
          key={conversation.id}
          type="button"
          onClick={() => handleConversationSelect(conversation.id)}
          className={cn(
            "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md active:translate-y-0",
            isActive
              ? "border-primary/40 bg-primary/10 shadow-md ring-1 ring-primary/10"
              : isUnread
                ? "border-amber-300/70 bg-amber-50/70 hover:bg-amber-50/90"
                : "border-border/60 bg-background/60 hover:border-primary/30 hover:bg-background/85",
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback>{avatarLetter}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className={cn("text-sm", isUnread ? "font-semibold" : "font-medium")}>
              {target?.fullName ?? target?.id?.slice(0, 8) ?? "Unknown user"}
            </p>
            {productTitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {productTitle}
                {productPrice !== null ? (
                  <>
                    {" · "}
                    {productPrice.toLocaleString()} {productCurrency}
                  </>
                ) : null}
              </p>
            ) : null}
            {conversation.lastMessage ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {conversation.lastMessage}
              </p>
            ) : null}
            {lastActivity ? (
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{lastActivity}</p>
            ) : null}
          </div>
        </button>
      );
    },
    [activeConversationId, userId, handleConversationSelect],
  );

  const renderMessages = useCallback(() => {
    if (!activeConversationId) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {strings.emptyMessages}
        </div>
      );
    }

    if (loadingMessages) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }

    if (messagesState.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {strings.emptyMessages}
        </div>
      );
    }

    const handleLoadMore = () => {
      if (!activeConversationId || !hasMore || !oldestCursor) return;
      void loadMessages(activeConversationId, { before: oldestCursor, append: true });
    };

    return (
      <div className="space-y-3">
        {hasMore && oldestCursor ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              className="text-[11px] text-primary underline-offset-2 hover:underline"
              disabled={loadingMessages}
            >
              {loadingMessages ? t("common.loading") : "Load earlier messages"}
            </button>
          </div>
        ) : null}
        {messagesState.map((message) => {
          const isViewer = message.senderId === userId;
          const translationState = messageTranslations[message.id];
          const showTranslated = !isViewer && translationState?.translated && translationState.showing;
          const contentToShow = showTranslated ? translationState?.translated ?? message.content : message.content;
          const isTranslating = Boolean(translationState?.loading);
          const timestamp = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true });

          return (
            <div
              key={message.id}
              className={cn("flex flex-col gap-1", isViewer ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[70%] rounded-[16px] px-3.5 py-1.5 text-sm shadow-sm",
                  isViewer ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <p className="whitespace-pre-line">{contentToShow}</p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  {!isViewer && (
                    <button
                      type="button"
                      onClick={() => handleToggleTranslation(message)}
                      className="text-[11px] underline-offset-2 hover:underline text-muted-foreground"
                    >
                      {isTranslating
                        ? t("common.loading")
                        : showTranslated
                        ? t("common.showOriginal")
                        : t("common.translate")}
                    </button>
                  )}
                  {isViewer && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (deletingMessageId) return;
                        const id = message.id;
                        setDeletingMessageId(id);
                        try {
                          const res = await fetch(`/api/messages/${encodeURIComponent(id)}`, {
                            method: "DELETE",
                          });
                          const payload = await res.json().catch(() => ({}));
                          if (!res.ok || !payload?.ok) {
                            const description =
                              typeof payload?.error === "string"
                                ? payload.error
                                : "We could not delete this message. Please try again.";
                            toast({
                              title: "Message not deleted",
                              description,
                              variant: "destructive",
                            });
                          } else {
                            setMessagesState((previous) => previous.filter((item) => item.id !== id));
                          }
                        } catch (error) {
                          console.error("Failed to delete message", error);
                          toast({
                            title: "Message not deleted",
                            description: "We could not delete this message. Please try again.",
                            variant: "destructive",
                          });
                        } finally {
                          setDeletingMessageId((current) => (current === id ? null : current));
                        }
                      }}
                      className="text-[11px] underline-offset-2 hover:underline text-muted-foreground"
                      disabled={deletingMessageId === message.id}
                    >
                      {deletingMessageId === message.id ? t("common.loading") : "Delete"}
                    </button>
                  )}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {timestamp}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [
    activeConversationId,
    handleToggleTranslation,
    loadingMessages,
    hasMore,
    loadMessages,
    oldestCursor,
    deletingMessageId,
    messageTranslations,
    messagesState,
    strings.emptyMessages,
    t,
    userId,
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Contacts</span>
        </div>
        <ScrollArea className="h-[320px] rounded-lg border p-2">
          {loadingConversations ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{strings.emptyConversations}</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => renderConversationSummary(conversation))}
            </div>
          )}
        </ScrollArea>
      </div>
      <div className="flex h-[420px] flex-col rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              {counterpart?.fullName ? `Chat with ${counterpart.fullName}` : "Chat"}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              <span>Status</span>
              <span>·</span>
              <span>Online</span>
            </div>
          </div>
        </div>
        {product && (
          <div className="border-b bg-muted/40 px-4 py-3">
            <Link href={`/product/${product.id}`} className="flex items-center gap-3">
              <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-muted">
                {productImageSrc ? (
                  <Image src={productImageSrc} alt={product.title} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold line-clamp-1">{product.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {typeof product.price === "number"
                    ? `${product.price.toLocaleString()} ${product.currency ?? "IQD"}`
                    : product.currency ?? null}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        )}
        <ScrollArea className="flex-1 px-4 py-4">
          {renderMessages()}
        </ScrollArea>
        <div className="border-t px-4 py-3">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={strings.typePlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendMessage();
                }
              }}
              disabled={!activeConversation || sending}
            />
            <Button
              size="icon"
              onClick={() => void handleSendMessage()}
              disabled={!activeConversation || sending}
              aria-label={strings.send}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
