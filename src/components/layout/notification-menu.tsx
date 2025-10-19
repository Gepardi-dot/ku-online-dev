'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import {
  countUnreadNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type NotificationRecord,
} from '@/lib/services/notifications-client';
import { toast } from '@/hooks/use-toast';

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

export default function NotificationMenu({ userId, strings }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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
      console.error('Failed to count notifications', error);
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
      console.error('Failed to load notifications', error);
      toast({
        title: 'Unable to fetch notifications',
        description: 'Please try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, refreshCount]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = subscribeToNotifications(userId, (notification, eventType) => {
      setNotifications((prev) => {
        const next = prev.filter((item) => item.id !== notification.id);
        if (eventType !== 'DELETE') {
          next.unshift(notification);
        }
        return next
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });

      setUnreadCount((prev) => {
        if (!notification.isRead && eventType === 'INSERT') {
          return prev + 1;
        }
        if (notification.isRead && eventType === 'UPDATE') {
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
        loadNotifications();
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
      console.error('Failed to mark notifications read', error);
      toast({
        title: 'Could not mark notifications as read',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [userId]);

  const handleNotificationClick = useCallback(
    async (notification: NotificationRecord) => {
      if (!userId || notification.isRead) {
        return;
      }

      try {
        await markNotificationRead(notification.id, userId);
        setNotifications((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark notification read', error);
      }
    },
    [userId],
  );

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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label={strings.label}>
          <Bell className="h-4 w-4" />
          {indicator}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">{strings.label}</div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-8">
              {strings.markAll}
            </Button>
          )}
        </div>
        <ScrollArea className="h-72">
          <div className="space-y-1 px-2 py-2">
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
                  : '';
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted ${
                      notification.isRead ? 'text-muted-foreground' : 'bg-primary/5'
                    }`}
                  >
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
                      {!notification.isRead && <span className="text-[10px] font-medium text-primary">New</span>}
                    </div>
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
