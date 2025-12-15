import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

type ManageReportBody = {
  id?: string;
  status?: 'open' | 'auto-flagged' | 'resolved' | 'dismissed';
  reactivateProduct?: boolean;
};

const handler: (request: Request) => Promise<Response> = async (request: Request) => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!supabaseServiceRole) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as ManageReportBody;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const status = typeof body.status === 'string' ? (body.status as ManageReportBody['status']) : undefined;
  const reactivateProduct = body.reactivateProduct === true;

  const allowedStatuses = new Set<ManageReportBody['status']>(['open', 'auto-flagged', 'resolved', 'dismissed']);

  if (!id) {
    return NextResponse.json({ error: 'Missing report id' }, { status: 400 });
  }

  if (status && !allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseServiceRole
    .from('abuse_reports')
    .select('id, product_id, status, is_auto_flagged')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('Failed to read abuse report for management', fetchError);
    return NextResponse.json({ error: 'Failed to read report' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  let updatedReport = existing;

  if (status) {
    const { data: updated, error: updateError } = await supabaseServiceRole
      .from('abuse_reports')
      .update({ status })
      .eq('id', id)
      .select('id, product_id, status, is_auto_flagged')
      .maybeSingle();

    if (updateError || !updated) {
      console.error('Failed to update abuse report status', updateError);
      return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
    }

    updatedReport = updated;
  }

  let productReactivated = false;
  if (reactivateProduct && updatedReport.product_id) {
    const { error: productError } = await supabaseServiceRole
      .from('products')
      .update({ is_active: true })
      .eq('id', updatedReport.product_id);

    if (productError) {
      console.error('Failed to reactivate product from moderation panel', productError);
      return NextResponse.json({ error: 'Failed to reactivate product' }, { status: 500 });
    }

    productReactivated = true;
  }

  return NextResponse.json({ ok: true, report: updatedReport, productReactivated });
};

export const PATCH = withSentryRoute(handler, 'abuse-report-manage');
export const POST = withSentryRoute(handler, 'abuse-report-manage');
