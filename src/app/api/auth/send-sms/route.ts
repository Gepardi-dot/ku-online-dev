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
  VONAGE_VIRTUAL_NUMBER,
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

function normalizeNumericSender(value: string) {
  let digits = value.trim();
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  digits = digits.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

function normalizeVonageSender(value: string) {
  const numeric = normalizeNumericSender(value);
  if (numeric) return { sender: numeric, type: 'numeric' as const };

  const alpha = normalizeSenderId(value);
  if (alpha) return { sender: alpha, type: 'alphanumeric' as const };

  return null;
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
  const apiKey = VONAGE_API_KEY?.trim();
  const apiSecret = VONAGE_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error('VONAGE_API_KEY and VONAGE_API_SECRET must be set.');
  }

  const body = new URLSearchParams({
    api_key: apiKey,
    api_secret: apiSecret,
    from,
    to,
    text,
  });

  const response = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    const detail = payload?.error_text || payload?.error || payload?.message;
    throw new Error(detail ? `Vonage SMS request failed: ${detail}` : 'Vonage SMS request failed.');
  }

  const message = Array.isArray(payload?.messages) ? payload.messages[0] : null;
  if (!message) {
    throw new Error('Vonage SMS response missing message payload.');
  }

  if (message.status !== '0') {
    const detail = message['error-text'] || message.error_text || message.error || message.message;
    throw new Error(detail ? `Vonage SMS rejected: ${detail}` : 'Vonage SMS rejected.');
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
  const senderRaw = VONAGE_SMS_SENDER_ID?.trim() || VONAGE_VIRTUAL_NUMBER?.trim() || 'KUBAZAR';
  const senderNormalized = normalizeVonageSender(senderRaw);

  if (!senderNormalized) {
    return hookError('Invalid sender ID. Use 3-11 alphanumeric or a valid phone number in E.164.', 400);
  }

  const messageText = buildMessage(otp);

  try {
    const result = await sendVonageSms({ to, text: messageText, from: senderNormalized.sender });

    const { error: logError } = await supabaseAdmin.from('vonage_sms_logs').insert({
      message_id: result.messageId ?? crypto.randomUUID(),
      from_number: senderNormalized.sender,
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
    if (error instanceof Error && /bad credentials/i.test(error.message)) {
      const apiKeyTail = VONAGE_API_KEY?.trim().slice(-4) || '(missing)';
      const apiSecretLen = VONAGE_API_SECRET?.trim().length || 0;
      console.error('Vonage credentials look invalid. Verify VONAGE_API_KEY/VONAGE_API_SECRET in Vercel env.', {
        apiKeyTail,
        apiSecretLen,
      });
    }
    return hookError(error instanceof Error ? error.message : 'SMS send failed.', 502);
  }

  return NextResponse.json({ ok: true });
}, 'supabase-send-sms-hook');
