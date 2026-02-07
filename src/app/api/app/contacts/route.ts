import { NextResponse } from 'next/server';

import { getAppContacts } from '@/lib/services/app-contacts';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

export const GET = withSentryRoute(async () => {
  const contacts = await getAppContacts();
  return NextResponse.json({ ok: true, contacts });
}, 'app-contacts-get');

