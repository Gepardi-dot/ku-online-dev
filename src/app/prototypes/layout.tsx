import type { ReactNode } from 'react';
import Link from 'next/link';

import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { requirePrototypesAccess } from '@/lib/prototypes/gate';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PrototypesLayout({ children }: { children: ReactNode }) {
  const { user, enabledByEnv } = await requirePrototypesAccess();

  return (
    <AppLayout user={user}>
      <div className="bg-accent">
        <div className="container mx-auto px-4 pt-6">
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/60 bg-white/70 px-4 py-3 shadow-sm ring-1 ring-black/5',
              enabledByEnv ? 'border-brand/30 bg-linear-to-r from-brand/10 via-white/70 to-white/70' : null,
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2D2D2D]" dir="auto">
                Prototype showroom
              </p>
              <p className="text-xs text-muted-foreground" dir="auto">
                Mock data • Not connected to Supabase
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-10 rounded-full bg-white/80">
                <Link href="/prototypes">Showroom</Link>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-full bg-white/80">
                <Link href="/sponsors">Live sponsors</Link>
              </Button>
              <Button asChild className="h-10 rounded-full">
                <Link href="/">Home</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="pt-6">{children}</div>
      </div>
    </AppLayout>
  );
}

