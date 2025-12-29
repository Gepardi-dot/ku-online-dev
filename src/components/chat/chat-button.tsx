'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  fetchMessages,
  getOrCreateConversation,
  markConversationRead,
  subscribeToConversation,
  type MessageRecord,
} from '@/lib/services/messages-client';
import { toast } from '@/hooks/use-toast';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import { useLocale } from '@/providers/locale-provider';

interface ChatButtonProps {
  sellerId: string;
  sellerName: string;
  productId: string;
  productTitle: string;
  viewerId?: string | null;
}

export default function ChatButton({
  sellerId,
  sellerName,
  productId,
  productTitle,
  viewerId,
}: ChatButtonProps) {
  const { t, locale } = useLocale();
  const relativeTimeLocale = useMemo(() => {
    if (locale === 'ku') return 'ku-u-nu-arab';
    if (locale === 'ar') return 'ar-u-nu-arab';
    return 'en-US';
  }, [locale]);
  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(relativeTimeLocale, { numeric: 'auto' }),
    [relativeTimeLocale],
  );
  const formatRelativeTime = useCallback(
    (date: Date) => {
      const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
      const absSeconds = Math.abs(diffSeconds);

      if (absSeconds < 60) {
        return relativeTimeFormatter.format(diffSeconds, 'second');
      }

      const diffMinutes = Math.round(diffSeconds / 60);
      if (Math.abs(diffMinutes) < 60) {
        return relativeTimeFormatter.format(diffMinutes, 'minute');
      }

      const diffHours = Math.round(diffMinutes / 60);
      if (Math.abs(diffHours) < 24) {
        return relativeTimeFormatter.format(diffHours, 'hour');
      }

      const diffDays = Math.round(diffHours / 24);
      if (Math.abs(diffDays) < 30) {
        return relativeTimeFormatter.format(diffDays, 'day');
      }

      const diffMonths = Math.round(diffDays / 30);
      if (Math.abs(diffMonths) < 12) {
        return relativeTimeFormatter.format(diffMonths, 'month');
      }

      const diffYears = Math.round(diffMonths / 12);
      return relativeTimeFormatter.format(diffYears, 'year');
    },
    [relativeTimeFormatter],
  );
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [initializing, setInitializing] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [counterpartOnline, setCounterpartOnline] = useState(false);
  const presenceChannelRef = useRef<import('@supabase/supabase-js').RealtimeChannel | null>(null);
  const supabaseClientRef = useRef(createSupabaseClient());
  const [counterpartTyping, setCounterpartTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const counterpartName = sellerName;

  const canChat = useMemo(() => {
    if (!viewerId) return false;
    if (!sellerId) return false;
    if (viewerId === sellerId) return false;
    return true;
  }, [sellerId, viewerId]);

  const loadConversation = useCallback(async () => {
    if (!canChat || !viewerId) {
      return;
    }

    setInitializing(true);

    try {
      const conversation = await getOrCreateConversation(sellerId, viewerId, productId);
      setConversationId(conversation);
      const history = await fetchMessages(conversation);
      setMessages(history);
      await markConversationRead(conversation, viewerId);
    } catch (error) {
      console.error('Failed to start chat', error);
      toast({
        title: t('header.chatUnavailableTitle'),
        description: t('header.chatUnavailableBody'),
        variant: 'destructive',
      });
      setOpen(false);
    } finally {
      setInitializing(false);
    }
  }, [canChat, viewerId, sellerId, productId, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!canChat) {
      if (!viewerId) {
        toast({
          title: t('header.chatSignInTitle'),
          description: t('header.chatSignInBody'),
        });
      } else if (viewerId === sellerId) {
        toast({
          title: t('header.chatSelfTitle'),
          description: t('header.chatSelfBody'),
        });
      } else {
        toast({
          title: t('header.chatUnavailableTitle'),
          description: t('header.chatUnavailableBody'),
        });
      }
      setOpen(false);
      return;
    }

    loadConversation();
  }, [open, canChat, viewerId, sellerId, loadConversation, t]);

  useEffect(() => {
    if (!conversationId || !viewerId || !open) {
      return;
    }

    const channel = subscribeToConversation(conversationId, async (message) => {
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });

      if (message.receiverId === viewerId) {
        try {
          await markConversationRead(conversationId, viewerId);
        } catch (error) {
          console.error('Failed to mark message read', error);
        }
      }
    });

    // Presence: show whether counterpart is online in this conversation
    try {
      const supabase = supabaseClientRef.current;
      const presence = supabase.channel(`presence:conv:${conversationId}`, {
        config: { presence: { key: viewerId } },
      });
      presence.on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState();
        const keys = Object.keys(state || {});
        // counterpart considered online if someone other than viewerId is present
        setCounterpartOnline(keys.some((k) => k !== viewerId));
      });
      presence.on('broadcast', { event: 'typing' }, (payload: any) => {
        const from = payload?.payload?.userId;
        if (from && from !== viewerId) {
          setCounterpartTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setCounterpartTyping(false), 1500);
        }
      });
      presence.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presence.track({ online: true });
        }
      });
      presenceChannelRef.current = presence;
    } catch (_) {
      // ignore presence errors in environments without realtime
    }

    return () => {
      channel.unsubscribe();
      presenceChannelRef.current?.unsubscribe();
      presenceChannelRef.current = null;
    };
  }, [conversationId, viewerId, open]);

  const handleSendMessage = useCallback(async () => {
    if (!conversationId || !viewerId) {
      return;
    }

    const trimmed = newMessage.trim();
    if (!trimmed || sending) {
      return;
    }

    setSending(true);

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, receiverId: sellerId, productId, content: trimmed }),
      });
      const bodyText = await res.text().catch(() => '');
      let payload: { message?: MessageRecord; error?: string } | null = null;
      if (bodyText) {
        try {
          payload = JSON.parse(bodyText) as { message?: MessageRecord; error?: string };
        } catch {
          payload = null;
        }
      }
      if (!res.ok || !payload?.message) {
        const description = typeof payload?.error === 'string'
          ? payload.error
          : `Please try sending your message again${res.status ? ` (${res.status})` : ''}.`;
        toast({
          title: t('header.chatMessageNotSentTitle'),
          description,
          variant: 'destructive',
        });
        return;
      }
      const message: MessageRecord = payload.message as MessageRecord;

      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message', error);
      toast({
        title: t('header.chatMessageNotSentTitle'),
        description: t('header.chatMessageNotSentBody'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
    }, [conversationId, viewerId, sellerId, productId, newMessage, sending, t]);

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!viewerId) {
        return;
      }

      setDeletingMessageId(messageId);

      try {
        const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}`, {
          method: 'DELETE',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.ok) {
          const description =
            typeof payload?.error === 'string'
              ? payload.error
              : t('header.chatMessageNotDeletedBody');
          toast({
            title: t('header.chatMessageNotDeletedTitle'),
            description,
            variant: 'destructive',
          });
          return;
        }

        setMessages((previous) => previous.filter((item) => item.id !== messageId));
      } catch (error) {
        console.error('Failed to delete message', error);
      toast({
        title: t('header.chatMessageNotDeletedTitle'),
        description: t('header.chatMessageNotDeletedBody'),
        variant: 'destructive',
      });
      } finally {
        setDeletingMessageId((current) => (current === messageId ? null : current));
      }
    },
    [viewerId, t],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  // Broadcast "typing" with a short throttle
  useEffect(() => {
    const ch = presenceChannelRef.current;
    if (!ch || !open || !viewerId) return;
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      ch.send({ type: 'broadcast', event: 'typing', payload: { userId: viewerId } });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [newMessage, open, viewerId]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
      } else {
        setOpen(false);
      }
    },
    [],
  );

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
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message.content,
            targetLocale: locale,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          translatedText?: string;
        };
        if (!response.ok || typeof data.translatedText !== 'string') {
          throw new Error('Failed to translate');
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
        console.error('Failed to translate message', error);
        toast({
          title: t('common.loading'),
          description: 'Could not translate this message. Please try again.',
          variant: 'destructive',
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
    [locale, t],
  );

  const renderMessages = () => {
    if (initializing) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground text-center px-6">
            {t('header.chatStartConversation')}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {messages.map((message) => {
          const isViewer = message.senderId === viewerId;
          const translationState = messageTranslations[message.id];
          const showTranslated =
            !isViewer && translationState?.translated && translationState.showing;
          const contentToShow = showTranslated
            ? translationState?.translated ?? message.content
            : message.content;
          const isTranslating = Boolean(translationState?.loading);
          return (
            <div key={message.id} className={`flex ${isViewer ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  isViewer ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <p dir="auto" className="whitespace-pre-line text-[15px] font-sans leading-relaxed bidi-auto">
                  {contentToShow}
                </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p
                    className={`text-[11px] uppercase tracking-wide opacity-70 ${
                      isViewer ? 'text-primary-foreground/80' : ''
                    }`}
                  >
                    {formatRelativeTime(new Date(message.createdAt))}
                  </p>
                  <div className="flex items-center gap-2">
                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() => handleToggleTranslation(message)}
                        className="text-[11px] underline-offset-2 hover:underline text-muted-foreground"
                      >
                        {isTranslating
                          ? t('common.loading')
                          : showTranslated
                          ? t('common.showOriginal')
                          : t('common.translate')}
                      </button>
                    )}
                    {isViewer && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(message.id)}
                        className="text-[11px] underline-offset-2 hover:underline text-muted-foreground"
                        disabled={deletingMessageId === message.id}
                      >
                        {deletingMessageId === message.id ? t('common.loading') : t('header.chatDeleteMessage')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          className="relative w-full h-14 rounded-full bg-[linear-gradient(110deg,#ff8a2a,#f97316,#fb7185)] text-white shadow-[0_18px_40px_rgba(249,115,22,0.35)] ring-1 ring-white/40 hover:shadow-[0_22px_46px_rgba(249,115,22,0.45)] hover:brightness-[1.02] focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">
            {t('product.chatWithSellerButton')}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] rounded-[32px] border border-white/60 bg-gradient-to-br from-white/30 via-white/20 to-white/5 !bg-transparent p-6 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white/60 shadow-sm">
              <AvatarFallback className="bg-[#FFF8F0] text-brand font-semibold">{sellerName ? sellerName[0] : 'U'}</AvatarFallback>
            </Avatar>
            <span className="flex flex-col">
              <span className="font-semibold text-[#2D2D2D] leading-tight">
                {t('header.chatWith')} {counterpartName}
              </span>
              <span className="text-xs text-brand">
                <span dir="auto" className="bidi-auto">{productTitle}</span>
                {counterpartOnline && (
                  <>
                    {' '}
                    <span className="ml-2 inline-flex items-center gap-1 text-green-600">
                      <span className="h-2 w-2 rounded-full bg-green-600" /> {t('header.chatOnline')}
                    </span>
                  </>
                )}
                {counterpartTyping && (
                  <span className="ml-2 text-xs italic text-muted-foreground">{t('header.chatTyping')}</span>
                )}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ScrollArea className="h-[300px] w-full rounded-2xl border border-[#eadbc5]/70 bg-white/50 shadow-sm ring-1 ring-black/[0.03]">
            <div className="p-4">{renderMessages()}</div>
          </ScrollArea>

          <div className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={viewerId ? t('header.chatInputPlaceholder') : t('header.chatInputPlaceholderSignedOut')}
              disabled={!canChat || initializing || sending}
              className="rounded-full border-[#eadbc5]/70 bg-white/70 focus:border-brand/50 focus:ring-brand/20"
            />
            <Button 
              onClick={handleSendMessage} 
              size="icon" 
              disabled={!canChat || initializing || sending}
              className="rounded-full h-10 w-10 bg-brand hover:bg-brand-dark shadow-md"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {!canChat && (
            <p className="text-xs text-muted-foreground">
              {viewerId ? t('header.chatCannotChatSelf') : t('header.chatCannotChatSignedOut')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
