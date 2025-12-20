import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL } = getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const runtime = 'nodejs';

const DELETE_RATE_LIMIT = { windowMs: 60_000, max: 3 } as const; // at most 3 attempts per minute per IP
const originAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

export const POST = withSentryRoute(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (origin && !isOriginAllowed(origin, originAllowList)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const rate = checkRateLimit(`account:delete:${clientIdentifier}`, DELETE_RATE_LIMIT);
    if (!rate.success) {
      const res = NextResponse.json({ error: 'Too many delete attempts. Please try again shortly.' }, { status: 429 });
      res.headers.set('Retry-After', String(Math.max(1, rate.retryAfter)));
      return res;
    }
  }

  const reconfirm = request.headers.get('x-reconfirm')?.toLowerCase() ?? '';
  if (reconfirm !== 'delete') {
    return NextResponse.json({ error: 'Reconfirmation header missing' }, { status: 400 });
  }

  const confirmationHeader = request.headers.get('x-delete-confirmation');
  const body = await request.json().catch(() => null);
  const confirmationValue =
    typeof confirmationHeader === 'string' && confirmationHeader.length > 0
      ? confirmationHeader
      : typeof body?.confirmation === 'string'
        ? body.confirmation
        : typeof body?.code === 'string'
          ? body.code
          : '';

  if (!isDeleteConfirmationValid(confirmationValue)) {
    return NextResponse.json({ error: 'Invalid delete confirmation code' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 400 });
  }

  // Remove associated profile/data rows (service role bypasses RLS; cascades will clean dependents).
  const { error: profileDeleteError } = await supabaseAdmin.from('users').delete().eq('id', user.id);
  if (profileDeleteError) {
    return NextResponse.json({ error: profileDeleteError.message }, { status: 400 });
  }

  // Terminate current session
  await supabase.auth.signOut({ scope: 'global' });

  return NextResponse.json({ ok: true });
});

function isDeleteConfirmationValid(value: string) {
  const normalizedDigits = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  return normalizedDigits === '123';
}
