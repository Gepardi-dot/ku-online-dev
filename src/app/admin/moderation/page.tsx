import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';
import ModerationTable, { type ModerationReport } from './moderation-table';

export const dynamic = 'force-dynamic';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

export default async function ModerationPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  let reports: ModerationReport[] = [];

  if (supabaseServiceRole) {
    const { data, error } = await supabaseServiceRole
      .from('abuse_reports')
      .select(`
        id,
        reason,
        details,
        status,
        is_auto_flagged,
        created_at,
        product:products (
          id,
          title,
          is_active,
          seller_id
        ),
        reporter:users!abuse_reports_reporter_id_fkey (
          id,
          email,
          full_name,
          name
        ),
        reported_user:users!abuse_reports_reported_user_id_fkey (
          id,
          email,
          full_name,
          name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Failed to load abuse reports for moderation', error);
    } else if (data) {
      reports = data.map((row: any) => ({
        id: row.id,
        reason: row.reason,
        details: row.details ?? null,
        status: row.status,
        isAutoFlagged: Boolean(row.is_auto_flagged),
        createdAt: row.created_at,
        product: row.product
          ? {
              id: row.product.id,
              title: row.product.title ?? 'Listing',
              isActive: row.product.is_active ?? true,
            }
          : null,
        reporter: row.reporter
          ? {
              id: row.reporter.id,
              name: row.reporter.full_name ?? row.reporter.name ?? row.reporter.email ?? 'Reporter',
            }
          : null,
        reportedUser: row.reported_user
          ? {
              id: row.reported_user.id,
              name:
                row.reported_user.full_name ??
                row.reported_user.name ??
                row.reported_user.email ??
                'Reported user',
            }
          : null,
      }));
    }
  }

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Moderation dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <ModerationTable reports={reports} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
