import type { User } from '@supabase/supabase-js';

export function getUserRole(user: User | null | undefined): string | null {
  if (!user) {
    return null;
  }

  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined) ??
    (user.role as string | undefined);

  if (!role) {
    return null;
  }

  return role.toLowerCase();
}

export function isAdmin(user: User | null | undefined): boolean {
  return getUserRole(user) === 'admin';
}

export function isModerator(user: User | null | undefined): boolean {
  const normalized = getUserRole(user);
  return normalized === 'admin' || normalized === 'moderator';
}
