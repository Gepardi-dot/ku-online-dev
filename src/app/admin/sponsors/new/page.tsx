import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdmin } from '@/lib/auth/roles';
import { createClient } from '@/utils/supabase/server';
import NewSponsorStoreForm from './new-sponsor-store-form';

export default async function NewSponsorStorePage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user)) {
    redirect('/');
  }

  return (
    <AppLayout user={user}>
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4">
          <Link
            href="/sponsors"
            className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-white"
          >
            Back to Sponsors
          </Link>
        </div>

        <Card className="rounded-[24px] border border-white/60 bg-linear-to-br from-white/78 via-white/68 to-white/45 shadow-[0_16px_48px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-extrabold text-[#111827]">Create sponsor store</CardTitle>
            <p className="text-sm text-muted-foreground">
              Use this admin form to create a store profile before assigning a seller.
            </p>
          </CardHeader>
          <CardContent>
            <NewSponsorStoreForm />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
