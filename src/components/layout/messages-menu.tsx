'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Loader2, ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import {
  countUnreadMessages,
  fetchMessages,
  fetchConversation,
  listConversationsForUser,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  subscribeToIncomingMessages,
  type ConversationSummary,
  type MessageRecord,
} from '@/lib/services/messages-client';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

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
}

export default function MessagesMenu({ userId, strings }: MessagesMenuProps) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const conversationsRef = useRef<ConversationSummary[]>([]);

  const canLoad = Boolean(userId);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await countUnreadMessages(userId);
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to count unread messages', error);
    }
  }, [userId]);

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
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
      console.error('Failed to load conversations', error);
      toast({
        title: 'Unable to load conversations',
        description: 'Please try again soon.',
        variant: 'destructive',
      });
    } finally {
      setLoadingConversations(false);
    }
  }, [userId]);

  const loadMessages = useCallback(
    async (conversationId: string | null) => {
      if (!conversationId || !userId) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      try {
        const history = await fetchMessages(conversationId);
        setMessages(history);
        await markConversationRead(conversationId, userId);
        setUnreadCount((prev) => Math.max(0, prev - history.filter((item) => !item.isRead && item.receiverId === userId).length));
      } catch (error) {
        console.error('Failed to load messages', error);
        toast({
          title: 'Unable to load messages',
          description: 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoadingMessages(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    if (!userId || !open) {
      return;
    }
    loadConversations();
  }, [userId, open, loadConversations]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = subscribeToIncomingMessages(userId, (message) => {
      setConversations((prev) => {
        const existing = prev.find((item) => item.id === message.conversationId);
        if (!existing) {
          return prev;
        }
        const updated = { ...existing, lastMessage: message.content, lastMessageAt: message.createdAt };
        const others = prev.filter((item) => item.id !== message.conversationId);
        return [updated, ...others];
      });

      if (!open || message.conversationId !== activeConversationId) {
        setUnreadCount((prev) => prev + 1);
      }

      if (!conversationsRef.current.some((conversation) => conversation.id === message.conversationId)) {
        fetchConversation(message.conversationId)
          .then((summary) => {
            if (!summary) {
              return;
            }
            setConversations((prev) => {
              if (prev.some((item) => item.id === summary.id)) {
                return prev;
              }
              return [summary, ...prev];
            });
          })
          .catch((error) => {
            console.error('Failed to hydrate conversation from realtime message', error);
          });
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, open, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !open) {
      setMessages([]);
      return;
    }
    loadMessages(activeConversationId);
  }, [activeConversationId, open, loadMessages]);

  useEffect(() => {
    setDraft('');
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !open) {
      return;
    }

    const channel = subscribeToConversation(activeConversationId, async (message) => {
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });

      if (message.receiverId === userId) {
        try {
          await markConversationRead(activeConversationId, userId!);
          setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (error) {
          console.error('Failed to mark message read', error);
        }
      }

      setConversations((prev) => {
        const existing = prev.find((item) => item.id === message.conversationId);
        if (!existing) {
          return prev;
        }
        const updated = { ...existing, lastMessage: message.content, lastMessageAt: message.createdAt };
        const others = prev.filter((item) => item.id !== message.conversationId);
        return [updated, ...others];
      });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [activeConversationId, userId, open]);

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
        loadMessages(conversationId);
      }
    },
    [open, loadMessages],
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

  const handleSendMessage = useCallback(async () => {
    if (!activeConversation || !userId || sending) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setSending(true);

    const receiverId = activeConversation.sellerId === userId ? activeConversation.buyerId : activeConversation.sellerId;

    try {
      const message = await sendMessage({
        conversationId: activeConversation.id,
        senderId: userId,
        receiverId,
        productId: activeConversation.productId,
        content: trimmed,
      });
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
      setDraft('');
    } catch (error) {
      console.error('Failed to send message', error);
      toast({
        title: 'Message not sent',
        description: 'Please try sending your message again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }, [activeConversation, userId, draft, sending]);

  const indicator = useMemo(() => {
    if (!unreadCount) {
      return null;
    }
    const displayCount = unreadCount > 9 ? '9+' : String(unreadCount);
    return (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
        {displayCount}
      </span>
    );
  }, [unreadCount]);

  const renderConversationSummary = (conversation: ConversationSummary) => {
    const isActive = conversation.id === activeConversationId;
    const lastActivity = conversation.lastMessageAt
      ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
      : null;
    const target = conversation.sellerId === userId ? conversation.buyer : conversation.seller;
    const avatarLetter = target?.fullName ? target.fullName[0] : 'U';

    return (
      <button
        key={conversation.id}
        type="button"
        onClick={() => handleConversationSelect(conversation.id)}
        className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition hover:border-primary/40 ${
          isActive ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/50'
        }`}
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback>{avatarLetter}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-medium">
            {target?.fullName ?? target?.id?.slice(0, 8) ?? 'Conversation'}
          </p>
          {conversation.lastMessage && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{conversation.lastMessage}</p>
          )}
          {lastActivity && <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{lastActivity}</p>}
        </div>
      </button>
    );
  };

  const renderMessages = () => {
    if (!activeConversationId) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {strings.empty}
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

    if (messages.length === 0) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {strings.empty}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {messages.map((message) => {
          const isViewer = message.senderId === userId;
          return (
            <div key={message.id} className={`flex ${isViewer ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  isViewer ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <p className="whitespace-pre-line">{message.content}</p>
                <p className={`mt-1 text-[11px] uppercase tracking-wide opacity-70 ${isViewer ? 'text-primary-foreground/80' : ''}`}>
                  {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label={strings.label}>
          <MessageCircle className="h-4 w-4" />
          {indicator}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{strings.label}</SheetTitle>
        </SheetHeader>
        {!canLoad ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {strings.loginRequired}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Conversations</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => loadConversations()}
                  disabled={loadingConversations}
                >
                  {loadingConversations ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
              <ScrollArea className="h-[260px] rounded-lg border p-2">
                {loadingConversations ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">{strings.empty}</p>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conversation) => renderConversationSummary(conversation))}
                  </div>
                )}
              </ScrollArea>
            </div>
            <div className="flex h-[360px] flex-col rounded-lg border">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    {counterpart?.fullName ?? 'Conversation'}
                  </p>
                  {activeConversation?.product?.id && (
                    <Link
                      href={`/product/${activeConversation.product.id}`}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View listing <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="space-y-3">{renderMessages()}</div>
              </ScrollArea>
              <div className="border-t px-4 py-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={strings.typePlaceholder}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={!activeConversation || sending}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!activeConversation || sending}
                    aria-label={strings.send}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
