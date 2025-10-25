'use client';

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
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
  sendMessage,
  subscribeToConversation,
  type MessageRecord,
} from '@/lib/services/messages-client';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

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
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [initializing, setInitializing] = useState(false);
  const [sending, setSending] = useState(false);

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
        title: 'Unable to start chat',
        description: 'We could not open the conversation. Please try again shortly.',
        variant: 'destructive',
      });
      setOpen(false);
    } finally {
      setInitializing(false);
    }
  }, [canChat, viewerId, sellerId, productId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!canChat) {
      if (!viewerId) {
        toast({
          title: 'Sign in to chat',
          description: 'Create an account or log in to message the seller.',
        });
      } else if (viewerId === sellerId) {
        toast({
          title: 'This is your listing',
          description: 'You cannot start a chat with yourself.',
        });
      } else {
        toast({
          title: 'Chat unavailable',
          description: 'This listing does not have an available seller to message.',
        });
      }
      setOpen(false);
      return;
    }

    loadConversation();
  }, [open, canChat, viewerId, sellerId, loadConversation]);

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

    return () => {
      channel.unsubscribe();
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
      const message = await sendMessage({
        conversationId,
        senderId: viewerId,
        receiverId: sellerId,
        productId,
        content: trimmed,
      });

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
        title: 'Message not sent',
        description: 'Please try sending your message again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }, [conversationId, viewerId, sellerId, productId, newMessage, sending]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

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
            Start a conversation about this item.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {messages.map((message) => {
          const isViewer = message.senderId === viewerId;
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <MessageCircle className="mr-2 h-4 w-4" />
          Chat with Seller
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{sellerName ? sellerName[0] : 'U'}</AvatarFallback>
            </Avatar>
            <span className="flex flex-col">
              <span className="font-medium leading-tight">Chat with {counterpartName}</span>
              <span className="text-xs text-muted-foreground">{productTitle}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ScrollArea className="h-[300px] w-full rounded-lg border">
            <div className="p-4">{renderMessages()}</div>
          </ScrollArea>

          <div className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={viewerId ? 'Type your message…' : 'Sign in to send messages'}
              disabled={!canChat || initializing || sending}
            />
            <Button onClick={handleSendMessage} size="icon" disabled={!canChat || initializing || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {!canChat && (
            <p className="text-xs text-muted-foreground">
              {viewerId ? 'You cannot chat with yourself.' : 'Sign in to start chatting with sellers.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}