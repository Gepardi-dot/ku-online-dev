import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { normalizeMarketCityValue } from '@/data/market-cities';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { SELLER_APPLICATION_TYPE } from '@/lib/partnership-types';
import { createClient } from '@/utils/supabase/server';
import NewSponsorStoreForm, { type CreateStoreApplicationContext } from './new-sponsor-store-form';

type NewSponsorStoreSearchParams = {
  applicationId?: string;
  name?: string;
  ownerUserId?: string;
  city?: string;
  phone?: string;
  website?: string;
  whatsapp?: string;
};

const env = getEnv();
const supabaseServiceRole =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function getApplicationContext(applicationId: string): Promise<CreateStoreApplicationContext | null> {
  const normalizedId = applicationId.trim();
  if (!supabaseServiceRole || !normalizedId) {
    return null;
  }

  const { data, error } = await supabaseServiceRole
    .from('partnership_inquiries')
    .select('id, user_id, name, company, email, website, message, city, phone, status, created_at')
    .eq('id', normalizedId)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return {
    id: data.id,
    userId: typeof data.user_id === 'string' ? data.user_id : null,
    name: data.name ?? 'Applicant',
    company: typeof data.company === 'string' ? data.company : null,
    email: data.email ?? '',
    website: typeof data.website === 'string' ? data.website : null,
    message: data.message ?? '',
    city: typeof data.city === 'string' ? data.city : null,
    phone: typeof data.phone === 'string' ? data.phone : null,
    status:
      data.status === 'reviewed' || data.status === 'closed'
        ? data.status
        : 'new',
    createdAt: typeof data.created_at === 'string' ? data.created_at : null,
  };
}

export default async function NewSponsorStorePage({
  searchParams,
}: {
  searchParams?: Promise<NewSponsorStoreSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  const application =
    typeof params.applicationId === 'string' && params.applicationId.trim().length > 0
      ? await getApplicationContext(params.applicationId)
      : null;

  const initialName =
    (typeof params.name === 'string' ? params.name : '').trim() ||
    application?.company?.trim() ||
    application?.name?.trim() ||
    '';
  const initialOwnerUserId =
    (typeof params.ownerUserId === 'string' ? params.ownerUserId : '').trim() ||
    application?.userId ||
    '';
  const initialDescription = application?.message?.trim() || '';
  const initialPrimaryCity = normalizeMarketCityValue(
    typeof params.city === 'string' && params.city.trim().length > 0 ? params.city : application?.city ?? '',
  );
  const initialPhone =
    (typeof params.phone === 'string' ? params.phone : '').trim() || application?.phone?.trim() || '';
  const initialWebsite =
    (typeof params.website === 'string' ? params.website : '').trim() || application?.website?.trim() || '';
  const initialWhatsapp =
    (typeof params.whatsapp === 'string' ? params.whatsapp : '').trim() || application?.phone?.trim() || '';
  const locale = await getServerLocale();
  const sponsoredLabel = serverTranslate(locale, 'sponsorsHub.sponsoredBadge');
  const endsLabelTemplate = serverTranslate(locale, 'sponsorsHub.endsIn');
  const applicationsHref = `/admin/partnerships?type=${encodeURIComponent(SELLER_APPLICATION_TYPE)}&status=new`;

  return (
    <AppLayout user={user}>
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href="/admin/sponsors"
            className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-white"
          >
            Back to Stores Console
          </Link>
          {application ? (
            <Link
              href={applicationsHref}
              className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-white"
            >
              Back to Applications
            </Link>
          ) : null}
          <Link
            href="/sponsors"
            className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-white"
          >
            Back to Sponsors
          </Link>
        </div>

        <section className="mb-5 rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(255,255,255,0.82)_45%,_rgba(241,245,249,0.88))] p-5 shadow-[0_16px_48px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="inline-flex rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Admin workflow
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#111827]">Create Store</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Create the store, assign publishing settings, and finish setup in one workspace without switching pages.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 ring-1 ring-black/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Flow</p>
                <p className="mt-1 text-sm font-semibold text-[#111827]">Application to store</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 ring-1 ring-black/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Scope</p>
                <p className="mt-1 text-sm font-semibold text-[#111827]">Basics, contacts, card, offers</p>
              </div>
            </div>
          </div>
        </section>

        <NewSponsorStoreForm
          initialName={initialName}
          initialDescription={initialDescription}
          initialOwnerUserId={initialOwnerUserId}
          initialPrimaryCity={initialPrimaryCity}
          initialPhone={initialPhone}
          initialWebsite={initialWebsite}
          initialWhatsapp={initialWhatsapp}
          locale={locale}
          sponsoredLabel={sponsoredLabel}
          endsLabelTemplate={endsLabelTemplate}
          application={application}
        />
      </div>
    </AppLayout>
  );
}
