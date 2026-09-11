import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isModerator } from '@/lib/auth/roles';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { createClient } from '@/utils/supabase/server';
import AdminDraftsPanel from './admin-drafts-panel';

export const dynamic = 'force-dynamic';

export default async function AdminDraftsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);

  return (
    <AppLayout user={user}>
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Card className="mb-4 rounded-[24px] border border-white/60 bg-linear-to-br from-white/78 via-white/68 to-white/45 shadow-[0_16px_48px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl font-extrabold text-[#111827]">{t('collabDraft.adminTitle')}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/moderation"
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
              >
                {t('header.userMenu.moderation')}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <AdminDraftsPanel />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
