import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { createClient } from '@/utils/supabase/server';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const REPORT_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 40 } as const;
const REPORT_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 20 } as const;

type ReportBody = {
  targetType?: 'product' | 'user' | 'message';
  targetId?: string;
  reason?: string;
  details?: string;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  product_id: string | null;
  reported_user_id: string | null;
  message_id: string | null;
  status: string;
  is_auto_flagged: boolean;
  reason: string;
};

async function sendNotification(userId: string, title: string, content: string | null, relatedId: string | null) {
  if (!supabaseServiceRole) return;

  const { error } = await supabaseServiceRole.from('notifications').insert({
    user_id: userId,
    title,
    content,
    type: 'system',
    related_id: relatedId,
  });

  if (error) {
    console.error('Failed to send notification', error);
  }
}

async function handleAutoFlag(report: ReportRow) {
  if (!report.is_auto_flagged || !supabaseServiceRole) {
    return;
  }

  if (report.product_id) {
    const { data: product, error: productError } = await supabaseServiceRole
      .from('products')
      .select('id, seller_id, title, is_active')
      .eq('id', report.product_id)
      .maybeSingle();

    if (productError) {
      console.error('Failed to read product for auto-flag handling', productError);
    }

    if (product?.id) {
      if (product.is_active !== false) {
        const { error: hideError } = await supabaseServiceRole
          .from('products')
          .update({ is_active: false })
          .eq('id', product.id);

        if (hideError) {
          console.error('Failed to hide auto-flagged product', hideError);
        }
      }

      if (product.seller_id) {
        await sendNotification(
          product.seller_id,
          'Listing temporarily hidden',
          `Your listing "${product.title ?? 'product'}" was hidden after multiple reports. Please review and update it to comply with marketplace policies.`,
          product.id,
        );
      }
    }
  }

  const relatedId = report.product_id ?? report.reported_user_id ?? report.message_id ?? null;
  await sendNotification(
    report.reporter_id,
    'Report received',
    'We received your report and automatically flagged the content for review.',
    relatedId,
  );
}

const handler: (request: Request) => Promise<Response> = async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`abuse-report:ip:${clientIdentifier}`, REPORT_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const res = NextResponse.json(
        { error: 'Too many reports from this network. Please wait a moment.' },
        { status: 429 },
      );
      res.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as ReportBody;
  const targetType = body.targetType;
  const targetId = body.targetId;
  const reason = (body.reason ?? '').trim();
  const details = (body.details ?? '').trim() || null;

  if (!targetType || !targetId || !reason) {
    return NextResponse.json({ error: 'targetType, targetId, and reason are required.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`abuse-report:user:${user.id}`, REPORT_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    const res = NextResponse.json(
      { error: 'You have reached the report rate limit. Please try again later.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(Math.max(1, userRate.retryAfter)));
    return res;
  }

  const payload: {
    reporter_id: string;
    product_id?: string | null;
    reported_user_id?: string | null;
    message_id?: string | null;
    reason: string;
    details: string | null;
  } = {
    reporter_id: user.id,
    reason,
    details,
  };

  if (targetType === 'product') {
    payload.product_id = targetId;
  } else if (targetType === 'user') {
    payload.reported_user_id = targetId;
  } else if (targetType === 'message') {
    payload.message_id = targetId;
  } else {
    return NextResponse.json({ error: 'Unsupported targetType.' }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from('abuse_reports')
    .insert(payload)
    .select('id, reporter_id, product_id, reported_user_id, message_id, status, is_auto_flagged, reason')
    .single();

  if (error || !inserted) {
    console.error('Failed to create abuse report', error);
    return NextResponse.json({ error: 'Failed to submit report.' }, { status: 500 });
  }

  let reportRow: ReportRow = inserted as ReportRow;

  // Re-fetch to pick up trigger-updated status/flags.
  const { data: refreshed, error: refreshError } = await supabase
    .from('abuse_reports')
    .select('id, reporter_id, product_id, reported_user_id, message_id, status, is_auto_flagged, reason')
    .eq('id', inserted.id)
    .maybeSingle();

  if (refreshError) {
    console.error('Failed to refresh abuse report after insert', refreshError);
  } else if (refreshed) {
    reportRow = refreshed as ReportRow;
  }

  await handleAutoFlag(reportRow);

  // Best-effort audit logging including IP and user agent.
  const ip = clientIdentifier !== 'unknown' ? clientIdentifier : null;
  const userAgent = request.headers.get('user-agent');

  const auditContext: Record<string, unknown> = {
    targetType,
    targetId,
    reason,
    productId: targetType === 'product' ? targetId : null,
    reportedUserId: targetType === 'user' ? targetId : null,
    messageId: targetType === 'message' ? targetId : null,
  };

  const eventType =
    targetType === 'product'
      ? 'product.reported'
      : targetType === 'user'
      ? 'user.reported'
      : 'message.reported';

  try {
    await supabase.rpc('log_audit_event', {
      p_event_type: eventType,
      p_context: auditContext,
      p_ip: ip,
      p_user_agent: userAgent,
    });
  } catch (logError) {
    // Logging failures should never break the primary operation.
    console.error('Failed to log audit event for abuse report', logError);
  }

  return NextResponse.json({ ok: true });
};

export const POST = withSentryRoute(handler, 'abuse-report');
