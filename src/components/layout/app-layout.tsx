'use client';

import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import AppHeader from './header';

interface AppLayoutProps {
  children: ReactNode;
  user: User | null;
}

export default function AppLayout({ children, user }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
