import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isModerator } from '@/lib/auth/roles';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';
import { createClient } from '@/utils/supabase/server';
import AdminSponsorStoresPanel from './admin-sponsor-stores-panel';

export const dynamic = 'force-dynamic';

export default async function AdminSponsorStoresPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  const applicationsHref = `/admin/partnerships?type=${encodeURIComponent(SELLER_APPLICATION_TYPE)}&status=new`;

  return (
    <AppLayout user={user}>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Card className="mb-4 rounded-[24px] border border-white/60 bg-linear-to-br from-white/78 via-white/68 to-white/45 shadow-[0_16px_48px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl font-extrabold text-[#111827]">Sponsor stores console</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review pending stores, approve or disable quickly, and jump directly into each store workspace.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/sponsors/new"
                className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(247,111,29,0.25)] transition hover:bg-brand/90"
              >
                Create store
              </Link>
              <Link
                href={applicationsHref}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#111827] shadow-sm transition hover:bg-[#F9FAFB]"
              >
                Seller applications
              </Link>
              <Link
                href="/sponsors"
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#111827] shadow-sm transition hover:bg-[#F9FAFB]"
              >
                Back to sponsors
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminSponsorStoresPanel />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
