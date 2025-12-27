import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

import { createClient } from '@/utils/supabase/server';
import { getEnv } from '@/lib/env';
import { isModerator } from '@/lib/auth/roles';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';
import { translateProductFields } from '@/lib/ai/translate-product-fields';
import { syncAlgoliaProductById } from '@/lib/services/algolia-products';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const env = getEnv();
const supabaseAdmin = createSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const TRANSLATE_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 10 } as const;
const TRANSLATE_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 20 } as const;

const translateOriginAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ ok: false, error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function clampText(value: string | null | undefined, maxLength: number): string {
  const text = normalizeText(value);
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function computeSourceHash(title: string, description: string): string {
  const safeTitle = clampText(title, 140);
  const safeDescription = clampText(description, 1000);
  return sha256(`${safeTitle}\n\n${safeDescription}`.trim());
}

export const POST = withSentryRoute(async (request: NextRequest) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, translateOriginAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`product-translate:ip:${clientIdentifier}`, TRANSLATE_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many requests from this network. Please try again later.');
    }
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const userRate = checkRateLimit(`product-translate:user:${user.id}`, TRANSLATE_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Rate limit reached. Please wait before trying again.');
  }

  const payload = await request.json().catch(() => null);
  const productId = typeof payload?.productId === 'string' ? payload.productId : null;
  if (!productId) {
    return NextResponse.json({ ok: false, error: 'Missing productId' }, { status: 400 });
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id,seller_id,title,description,i18n_source_hash,is_active,is_sold,expires_at')
    .eq('id', productId)
    .maybeSingle();

  if (productError) {
    console.error('Failed to load product for translation', productError);
    return NextResponse.json({ ok: false, error: 'Unable to translate listing right now.' }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 });
  }

  if (product.seller_id !== user.id && !isModerator(user)) {
    return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  if (product.is_active === false || product.is_sold === true) {
    return NextResponse.json({ ok: true, productId, updated: false });
  }
  if (typeof product.expires_at === 'string' && product.expires_at <= nowIso) {
    return NextResponse.json({ ok: true, productId, updated: false });
  }

  const title = normalizeText(product.title);
  const description = normalizeText(product.description);

  if (!title && !description) {
    return NextResponse.json({ ok: true, productId, updated: false });
  }

  const sourceHash = computeSourceHash(title, description);
  if (product.i18n_source_hash && product.i18n_source_hash === sourceHash) {
    return NextResponse.json({ ok: true, productId, updated: false });
  }

  try {
    const translations = await translateProductFields({ title, description });
    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        title_translations: translations.title,
        description_translations: translations.description,
        i18n_source_hash: translations.sourceHash,
        i18n_updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (updateError) {
      console.error('Failed to store product translations', updateError);
      return NextResponse.json({ ok: false, productId, error: 'Unable to save translations right now.' }, { status: 500 });
    }

    try {
      await syncAlgoliaProductById(productId, supabaseAdmin);
    } catch (error) {
      console.warn('Algolia sync failed after translation', error);
    }

    return NextResponse.json({ ok: true, productId, updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Product translation failed', { productId, error: message });
    return NextResponse.json({ ok: false, productId, error: 'Translation failed. It will retry via cron soon.' });
  }
});
