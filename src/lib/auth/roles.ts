import type { User } from '@supabase/supabase-js';

export function isModerator(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }

  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined) ??
    (user.role as string | undefined);

  if (!role) {
    return false;
  }

  const normalized = role.toLowerCase();
  return normalized === 'admin' || normalized === 'moderator';
}
