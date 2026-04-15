import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { withSentryRoute } from '@/utils/sentry-route';
import { getEnv } from '@/lib/env';
import {
  buildOriginAllowList,
  checkRateLimit,
  getClientIdentifier,
  isOriginAllowed,
  isSameOriginRequest,
} from '@/lib/security/request';

export const runtime = 'nodejs';

const { NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VONAGE_API_KEY, VONAGE_API_SECRET } =
  getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WEBHOOK_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 300 } as const;
const WEBHOOK_RATE_LIMIT_PER_PRINCIPAL = { windowMs: 60_000, max: 120 } as const;
const HEALTH_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 120 } as const;

const webhookOriginAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'https://ku-online-dev.vercel.app',
  'http://localhost:5000',
]);

const webhookSchema = z
  .object({
    type: z.string().trim().min(1).max(64),
    msisdn: z.string().trim().max(40).optional(),
    to: z.string().trim().max(40).optional(),
    text: z.string().trim().max(4000).optional(),
    messageId: z.string().trim().max(128).optional(),
    status: z.string().trim().max(64).optional(),
    'message-timestamp': z.string().trim().max(64).optional(),
  })
  .passthrough();

const incomingSmsSchema = z
  .object({
    type: z.literal('text'),
    msisdn: z.string().trim().min(1).max(40),
    to: z.string().trim().min(1).max(40),
    text: z.string().trim().min(1).max(4000),
    messageId: z.string().trim().min(1).max(128).optional(),
    'message-timestamp': z.string().trim().max(64).optional(),
  })
  .passthrough();

const deliveryReceiptSchema = z
  .object({
    type: z.literal('delivery-receipt'),
    messageId: z.string().trim().min(1).max(128),
    status: z.string().trim().min(1).max(64),
    'message-timestamp': z.string().trim().max(64).optional(),
  })
  .passthrough();

type VonageWebhookPayload = z.infer<typeof webhookSchema>;
type IncomingSmsPayload = z.infer<typeof incomingSmsSchema>;
type DeliveryReceiptPayload = z.infer<typeof deliveryReceiptSchema>;

function tooManyRequestsResponse(error: string, retryAfter: number) {
  const response = NextResponse.json({ error }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

function normalizeSignatureEntries(signature: string): string[] {
  return signature
    .split(/[,\s;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.includes('=')) {
        return part.split('=').pop() ?? '';
      }
      return part;
    })
    .map((part) => {
      if (part.startsWith('v1,')) return part.slice(3);
      return part;
    })
    .filter((part) => part && part !== 'v1' && part !== 'sha256' && part !== 'sha1' && part !== 'md5');
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// Best-effort verification for configured signed webhooks.
function verifyVonageWebhook(rawBody: string, signatureHeader?: string): boolean {
  if (!signatureHeader) {
    console.warn('Vonage webhook signature missing; accepting request for compatibility.');
    return true;
  }

  const secret = VONAGE_API_SECRET?.trim();
  if (!secret) {
    console.error('Vonage webhook signature was provided but VONAGE_API_SECRET is not configured.');
    return false;
  }

  const candidates = normalizeSignatureEntries(signatureHeader);
  if (!candidates.length) return false;

  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expectedMd5 = crypto.createHash('md5').update(`${rawBody}${secret}`).digest('hex');

  return candidates.some((candidate) => {
    const normalized = candidate.trim();
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    return (
      safeEquals(lower, expectedHex.toLowerCase()) ||
      safeEquals(normalized, expectedBase64) ||
      safeEquals(lower, expectedMd5.toLowerCase())
    );
  });
}

function parseWebhookBody(rawBody: string, contentType: string | null): unknown {
  const normalizedContentType = (contentType ?? '').toLowerCase();
  const trimmed = rawBody.trim();
  if (!trimmed) {
    throw new Error('empty');
  }

  if (normalizedContentType.includes('application/json') || trimmed.startsWith('{')) {
    return JSON.parse(rawBody);
  }

  if (normalizedContentType.includes('application/x-www-form-urlencoded') || rawBody.includes('=')) {
    const params = new URLSearchParams(rawBody);
    return Object.fromEntries(params.entries());
  }

  return JSON.parse(rawBody);
}

function resolveSignatureHeader(request: Request): string | undefined {
  return (
    request.headers.get('vonage-signature') ??
    request.headers.get('x-vonage-signature') ??
    request.headers.get('x-nexmo-signature') ??
    undefined
  );
}

function getPrincipalKey(payload: VonageWebhookPayload): string {
  const messageId = typeof payload.messageId === 'string' ? payload.messageId.trim() : '';
  if (messageId) {
    return `message:${messageId.slice(0, 128)}`;
  }

  const msisdn = typeof payload.msisdn === 'string' ? payload.msisdn.trim() : 'unknown';
  const to = typeof payload.to === 'string' ? payload.to.trim() : 'unknown';
  const type = payload.type.trim().toLowerCase();
  return `route:${type}:${msisdn}:${to}`.slice(0, 180);
}

function enforceOriginGuard(request: Request) {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, webhookOriginAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }
  return null;
}

// Handle incoming SMS messages
async function handleIncomingSMS(body: IncomingSmsPayload) {
  const messageId = body.messageId ?? crypto.randomUUID();
  const timestamp = body['message-timestamp'];

  console.log('Incoming SMS webhook received', {
    type: body.type,
    messageId,
    from: body.msisdn,
    to: body.to,
  });

  try {
    const { error } = await supabaseAdmin.from('vonage_sms_logs').insert({
      message_id: messageId,
      from_number: body.msisdn,
      to_number: body.to,
      message_text: body.text,
      message_type: body.type,
      received_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      direction: 'inbound',
    });

    if (error) {
      console.error('Failed to store SMS log:', error);
    }
  } catch (error) {
    console.error('Error storing SMS:', error);
  }

  return { status: 'received', messageId };
}

// Handle delivery receipts
async function handleDeliveryReceipt(body: DeliveryReceiptPayload) {
  const timestamp = body['message-timestamp'];

  console.log('Delivery receipt webhook received', {
    messageId: body.messageId,
    status: body.status,
  });

  try {
    const { error } = await supabaseAdmin.from('vonage_sms_logs').update({
      delivery_status: body.status,
      delivered_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
    }).eq('message_id', body.messageId);

    if (error) {
      console.error('Failed to update delivery status:', error);
    }
  } catch (error) {
    console.error('Error updating delivery status:', error);
  }

  return { status: 'updated', messageId: body.messageId };
}

export const POST = withSentryRoute(async (request: Request) => {
  const originGuard = enforceOriginGuard(request);
  if (originGuard) {
    return originGuard;
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`vonage-webhook:post:ip:${clientIdentifier}`, WEBHOOK_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse('Too many requests. Please wait a moment.', ipRate.retryAfter);
    }
  }

  const rawBody = await request.text();
  if (rawBody.length > 64_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const signature = resolveSignatureHeader(request);
  if (!verifyVonageWebhook(rawBody, signature)) {
    console.error('Invalid Vonage webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = parseWebhookBody(rawBody, request.headers.get('content-type'));
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }
  const body = parsed.data;

  const principalKey = getPrincipalKey(body);
  const principalRate = checkRateLimit(`vonage-webhook:post:principal:${principalKey}`, WEBHOOK_RATE_LIMIT_PER_PRINCIPAL);
  if (!principalRate.success) {
    return tooManyRequestsResponse('Too many requests. Please try again later.', principalRate.retryAfter);
  }

  let result: { status: string; messageId?: string | null; type?: string };
  switch (body.type) {
    case 'text': {
      const incoming = incomingSmsSchema.safeParse(body);
      if (!incoming.success) {
        return NextResponse.json({ error: 'Invalid text webhook payload' }, { status: 400 });
      }
      result = await handleIncomingSMS(incoming.data);
      break;
    }
    case 'delivery-receipt': {
      const receipt = deliveryReceiptSchema.safeParse(body);
      if (!receipt.success) {
        return NextResponse.json({ error: 'Invalid delivery receipt payload' }, { status: 400 });
      }
      result = await handleDeliveryReceipt(receipt.data);
      break;
    }
    default:
      console.log('Unhandled webhook type:', body.type);
      result = { status: 'received', type: body.type };
  }

  return NextResponse.json({
    status: 'ok',
    result,
    timestamp: new Date().toISOString(),
  });
}, 'vonage-webhook');

export const GET = withSentryRoute(async (request: Request) => {
  const originGuard = enforceOriginGuard(request);
  if (originGuard) {
    return originGuard;
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`vonage-webhook:health:ip:${clientIdentifier}`, HEALTH_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse('Too many requests. Please wait a moment.', ipRate.retryAfter);
    }
  }

  return NextResponse.json({
    status: 'active',
    service: 'vonage-webhook',
    timestamp: new Date().toISOString(),
    configured: Boolean(VONAGE_API_KEY && VONAGE_API_SECRET),
  });
}, 'vonage-webhook-health');
