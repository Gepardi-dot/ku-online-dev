import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getEnv } from '@/lib/env';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VONAGE_API_KEY,
  VONAGE_API_SECRET,
  VONAGE_SMS_SENDER_ID,
  VONAGE_SMS_TEMPLATE,
  SUPABASE_SMS_HOOK_SECRET,
} = getEnv();

const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const hookSchema = z.object({
  user: z.object({
    id: z.string().uuid().optional(),
    phone: z.string().min(1),
  }),
  sms: z.object({
    otp: z.string().min(1),
  }),
});

type HookPayload = z.infer<typeof hookSchema>;

function normalizeE164ForVonage(value: string) {
  let digits = value.trim();
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

function normalizeSenderId(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11);
  if (cleaned.length < 3) return null;
  return cleaned;
}

function buildMessage(otp: string) {
  const template = VONAGE_SMS_TEMPLATE?.trim() || 'KUBAZAR verification code: {{CODE}}. Do not share.';
  return template.replace('{{CODE}}', otp);
}

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function normalizeHookSecret(secret: string) {
  let value = secret.trim();
  if (value.startsWith('v1,')) {
    value = value.slice(3);
  }
  if (value.startsWith('whsec_')) {
    value = value.slice('whsec_'.length);
    try {
      return Buffer.from(value, 'base64');
    } catch {
      return Buffer.from(value);
    }
  }
  return Buffer.from(value);
}

function parseSignatures(header: string) {
  return header
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [version, signature] = entry.split(',', 2);
      return { version, signature };
    })
    .filter((entry) => entry.version && entry.signature);
}

function verifyStandardWebhookSignature({
  request,
  rawBody,
  secret,
}: {
  request: Request;
  rawBody: string;
  secret: string;
}) {
  const webhookId =
    request.headers.get('webhook-id') ||
    request.headers.get('svix-id') ||
    request.headers.get('wh-id');
  const webhookTimestamp =
    request.headers.get('webhook-timestamp') ||
    request.headers.get('svix-timestamp') ||
    request.headers.get('wh-timestamp');
  const webhookSignature =
    request.headers.get('webhook-signature') ||
    request.headers.get('svix-signature') ||
    request.headers.get('wh-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, error: 'Missing webhook signature headers.' };
  }

  const timestamp = Number.parseInt(webhookTimestamp, 10);
  if (Number.isNaN(timestamp)) {
    return { ok: false, error: 'Invalid webhook timestamp.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, error: 'Webhook timestamp outside tolerance.' };
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const secretKey = normalizeHookSecret(secret);
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(signedContent)
    .digest('base64');

  const candidates = parseSignatures(webhookSignature);
  const matches = candidates.some((entry) => {
    if (entry.version !== 'v1') return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(entry.signature),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  });

  if (!matches) {
    return { ok: false, error: 'Invalid webhook signature.' };
  }

  return { ok: true };
}

async function sendVonageSms({ to, text, from }: { to: string; text: string; from: string }) {
  if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
    throw new Error('VONAGE_API_KEY and VONAGE_API_SECRET must be set.');
  }

  const body = new URLSearchParams({
    from,
    to,
    text,
  });

  const auth = Buffer.from(`${VONAGE_API_KEY}:${VONAGE_API_SECRET}`).toString('base64');

  const response = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error_text || 'Vonage SMS request failed.');
  }

  const message = Array.isArray(payload?.messages) ? payload.messages[0] : null;
  if (!message) {
    throw new Error('Vonage SMS response missing message payload.');
  }

  if (message.status !== '0') {
    throw new Error(message['error-text'] || message.error_text || 'Vonage SMS rejected.');
  }

  return {
    messageId: message['message-id'] || message.messageId || null,
    remainingBalance: message['remaining-balance'] ?? message.remainingBalance ?? null,
  };
}

function hookError(message: string, httpCode = 500) {
  return NextResponse.json(
    {
      error: {
        http_code: httpCode,
        message,
      },
    },
    { status: httpCode }
  );
}

export const POST = withSentryRoute(async (request: Request) => {
  const rawBody = await request.text();
  if (SUPABASE_SMS_HOOK_SECRET) {
    const verification = verifyStandardWebhookSignature({
      request,
      rawBody,
      secret: SUPABASE_SMS_HOOK_SECRET,
    });
    if (!verification.ok) {
      return hookError(verification.error ?? 'Unauthorized hook request.', 401);
    }
  }

  let payload: HookPayload;
  try {
    payload = hookSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    console.error('Invalid hook payload', error);
    return hookError('Invalid hook payload.', 400);
  }

  const otp = payload.sms.otp.trim();
  const phone = payload.user.phone.trim();
  const to = normalizeE164ForVonage(phone);
  const senderRaw = VONAGE_SMS_SENDER_ID?.trim() || 'KUBAZAR';
  const sender = normalizeSenderId(senderRaw);

  if (!sender) {
    return hookError('Invalid sender ID. It must be 3-11 alphanumeric characters.', 400);
  }

  const messageText = buildMessage(otp);

  try {
    const result = await sendVonageSms({ to, text: messageText, from: sender });

    const { error: logError } = await supabaseAdmin.from('vonage_sms_logs').insert({
      message_id: result.messageId ?? crypto.randomUUID(),
      from_number: sender,
      to_number: phone,
      message_text: messageText,
      message_type: 'text',
      direction: 'outbound',
      delivery_status: 'submitted',
      received_at: new Date().toISOString(),
    });

    if (logError) {
      console.error('Failed to store outbound SMS log:', logError);
    }
  } catch (error) {
    console.error('Vonage SMS hook error:', error);
    return hookError(error instanceof Error ? error.message : 'SMS send failed.', 502);
  }

  return NextResponse.json({ ok: true });
}, 'supabase-send-sms-hook');
