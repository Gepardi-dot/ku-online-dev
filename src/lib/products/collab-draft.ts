import type { User } from '@supabase/supabase-js';

import { isModerator } from '@/lib/auth/roles';

export const COLLAB_DRAFT_DEFAULT_TITLE = 'Untitled listing';
export const COLLAB_DRAFT_DEFAULT_CONDITION = 'Used - Good';

export function canAccessCollabDraft(user: User | null | undefined, sellerId: string | null | undefined): boolean {
  if (!user?.id || !sellerId) {
    return false;
  }
  return user.id === sellerId || isModerator(user);
}

export function canPublishCollabDraft(user: User | null | undefined): boolean {
  return isModerator(user);
}

export function collabDraftPath(productId: string): string {
  return `/draft/${productId}`;
}
