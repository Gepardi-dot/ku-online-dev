import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

type ApplyBody = {
  phone?: string;
  idDocumentUrl?: string;
  businessDocumentUrl?: string;
  notes?: string;
};

function sanitizeText(value: unknown, max = 512): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

const handler: (request: Request) => Promise<Response> = async (request: Request) => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ApplyBody;
  const phone = sanitizeText(body.phone, 64);
  const idDocumentUrl = sanitizeText(body.idDocumentUrl, 512);
  const businessDocumentUrl = sanitizeText(body.businessDocumentUrl, 512);
  const notes = sanitizeText(body.notes, 800);

  if (!phone || !idDocumentUrl || !businessDocumentUrl) {
    return NextResponse.json(
      { error: 'Phone, ID document URL, and business document URL are required.' },
      { status: 400 },
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from('verification_requests')
    .select('id, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error('Failed to check existing verification requests', fetchError);
    return NextResponse.json({ error: 'Unable to submit right now.' }, { status: 500 });
  }

  if (existing && existing.status === 'pending') {
    return NextResponse.json({ error: 'You already have a pending verification request.' }, { status: 409 });
  }

  const { error: insertError } = await supabase.from('verification_requests').insert({
    user_id: user.id,
    phone,
    id_document_url: idDocumentUrl,
    business_document_url: businessDocumentUrl,
    notes,
  });

  if (insertError) {
    console.error('Failed to submit verification request', insertError);
    return NextResponse.json({ error: 'Failed to submit verification request.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'pending' });
};

export const POST = withSentryRoute(handler, 'verification-apply');
