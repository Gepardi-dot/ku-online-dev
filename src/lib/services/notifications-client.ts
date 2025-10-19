'use client';

import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

const supabase = createClient();

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  type: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

function mapNotificationRow(row: any): NotificationRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: (row.title as string) ?? 'Notification',
    content: (row.content as string) ?? null,
    type: (row.type as string) ?? 'system',
    relatedId: (row.related_id as string) ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at as string,
  };
}

export async function fetchNotifications(userId: string, limit = 20): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, title, content, type, related_id, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapNotificationRow(row));
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export function subscribeToNotifications(
  userId: string,
  handler: (notification: NotificationRecord, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void,
): RealtimeChannel {
  return supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const source = payload.new ?? payload.old;
        if (!source) {
          return;
        }
        const record = mapNotificationRow(source);
        handler(record, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE');
      },
    )
    .subscribe();
}
