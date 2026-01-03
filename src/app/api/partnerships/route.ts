import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
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

const env = getEnv();
const originAllowList = buildOriginAllowList([
  env.NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const schema = z.object({
  name: z.string().trim().min(2).max(140),
  company: z.string().trim().max(140).optional().or(z.literal('')),
  email: z.string().trim().email().max(255),
  website: z.string().trim().max(512).optional().or(z.literal('')),
  partnershipType: z.string().trim().min(2).max(64),
  message: z.string().trim().min(10).max(4000),
  budgetRange: z.string().trim().max(64).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  attachmentUrl: z.string().trim().max(512).optional().or(z.literal('')),
  honeypot: z.string().optional(),
});

const RATE_LIMIT_PER_IP = { windowMs: 5 * 60_000, max: 6 } as const;

async function sendEmailNotification(payload: {
  subject: string;
  body: string;
}): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  const toEmail = env.PARTNERSHIPS_NOTIFY_EMAIL ?? env.NEXT_PUBLIC_PARTNERSHIPS_EMAIL ?? null;
  const fromEmail = env.PARTNERSHIPS_FROM_EMAIL ?? null;

  if (!apiKey || !toEmail || !fromEmail) {
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: payload.subject,
      text: payload.body,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Failed to send partnership email', text);
    return false;
  }

  return true;
}

const handler = async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, originAllowList) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const rate = checkRateLimit(`partnerships:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!rate.success) {
      const res = NextResponse.json(
        { error: 'Too many requests. Please wait a few minutes and try again.' },
        { status: 429 },
      );
      res.headers.set('Retry-After', String(Math.max(1, rate.retryAfter)));
      return res;
    }
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const {
    name,
    company,
    email,
    website,
    partnershipType,
    message,
    budgetRange,
    country,
    city,
    phone,
    attachmentUrl,
    honeypot,
  } = parsed.data;

  if (honeypot && honeypot.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  const insertPayload = {
    user_id: user?.id ?? null,
    name,
    company: company || null,
    email,
    website: website || null,
    partnership_type: partnershipType,
    message,
    budget_range: budgetRange || null,
    country: country || null,
    city: city || null,
    phone: phone || null,
    attachment_url: attachmentUrl || null,
    status: 'new',
  } as const;

  const { error } = await supabase.from('partnership_inquiries').insert(insertPayload);
  if (error) {
    console.error('Failed to create partnership inquiry', error);
    return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 });
  }

  const subject = `Partnership inquiry: ${name}`;
  const bodyLines = [
    `Name: ${name}`,
    `Company: ${company || '-'}`,
    `Email: ${email}`,
    `Website: ${website || '-'}`,
    `Type: ${partnershipType}`,
    `Budget: ${budgetRange || '-'}`,
    `Country: ${country || '-'}`,
    `City: ${city || '-'}`,
    `Phone/WhatsApp: ${phone || '-'}`,
    `Attachment: ${attachmentUrl || '-'}`,
    '',
    message,
  ];
  const emailSent = await sendEmailNotification({ subject, body: bodyLines.join('\n') });

  const mailtoTarget = env.NEXT_PUBLIC_PARTNERSHIPS_EMAIL ?? env.PARTNERSHIPS_NOTIFY_EMAIL ?? null;
  const mailto = mailtoTarget
    ? `mailto:${encodeURIComponent(mailtoTarget)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
    : null;

  return NextResponse.json({ ok: true, emailSent, mailto });
};

export const POST = withSentryRoute(handler, 'partnerships');
