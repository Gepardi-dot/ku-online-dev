import 'server-only';

import type { User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';

export async function requirePrototypesAccess(): Promise<{
  user: User | null;
  isModerator: boolean;
  enabledByEnv: boolean;
}> {
  const enabledByEnv = (() => {
    const raw = process.env.NEXT_PUBLIC_ENABLE_PROTOTYPES ?? '';
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  })();

  // Developer ergonomics: prototypes should be viewable locally without requiring a moderator role
  // or special env flags. Keep Vercel deployments gated by default.
  const isVercelHosted = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
  const allowInThisEnv = enabledByEnv || !isVercelHosted;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const moderator = isModerator(user);
  if (!allowInThisEnv && !moderator) {
    redirect('/');
  }

  return { user, isModerator: moderator, enabledByEnv: allowInThisEnv };
}
