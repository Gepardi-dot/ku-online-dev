import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, Clock, Ticket, ArrowLeft } from 'lucide-react';

import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/server';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';
import { CopyCodeButton } from '@/components/sponsors/CopyCodeButton';

type VoucherClaimRow = {
  id: string;
  code: string | null;
  status: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  offer: {
    id: string;
    title: string | null;
    store: {
      id: string;
      name: string | null;
      slug: string | null;
    } | null;
  } | null;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toVoucherStatus(row: VoucherClaimRow, now: Date): 'active' | 'redeemed' | 'expired' | 'void' {
  const raw = (row.status ?? '').trim().toLowerCase();
  if (raw === 'redeemed') return 'redeemed';
  if (raw === 'void') return 'void';
  if (raw === 'expired') return 'expired';
  const expiresAt = toDate(row.expires_at);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export default async function VoucherDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ claimed?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const locale = await getServerLocale();
  const isRtl = rtlLocales.includes(locale);
  const now = new Date();

  const { data, error } = await supabase
    .from('sponsor_voucher_claims')
    .select(
      `
      id,
      code,
      status,
      expires_at,
      redeemed_at,
      offer:sponsor_offers(
        id,
        title,
        store:sponsor_stores(
          id,
          name,
          slug
        )
      )
    `,
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Failed to load voucher', error);
    notFound();
  }

  if (!data) {
    notFound();
  }

  const row = data as unknown as VoucherClaimRow;
  const code = (row.code ?? '').trim();
  if (!code) {
    notFound();
  }

  const status = toVoucherStatus(row, now);
  const storeName = row.offer?.store?.name ?? serverTranslate(locale, 'vouchers.unknownStore');
  const storeSlug = row.offer?.store?.slug ?? null;
  const offerTitle = row.offer?.title ?? serverTranslate(locale, 'vouchers.unknownOffer');

  const statusLabel =
    status === 'redeemed'
      ? serverTranslate(locale, 'vouchers.status.redeemed')
      : status === 'expired'
        ? serverTranslate(locale, 'vouchers.status.expired')
        : status === 'void'
          ? serverTranslate(locale, 'vouchers.status.void')
          : serverTranslate(locale, 'vouchers.status.active');

  const StatusIcon = status === 'redeemed' ? CheckCircle2 : status === 'expired' ? Clock : Ticket;
  const statusColor =
    status === 'redeemed' ? 'text-emerald-600' : status === 'expired' || status === 'void' ? 'text-amber-600' : 'text-brand';

  const showClaimedBanner = sp.claimed === '1';

  return (
    <AppLayout user={user}>
      <section className="pt-10 pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Button asChild variant="ghost" className="rounded-full">
                <Link href="/vouchers">
                  <ArrowLeft className={cn('h-4 w-4', isRtl ? 'rotate-180' : null)} aria-hidden="true" />
                  {serverTranslate(locale, 'vouchers.back')}
                </Link>
              </Button>
              {storeSlug ? (
                <Button asChild variant="link" className="text-primary font-semibold">
                  <Link href={`/sponsors/stores/${storeSlug}`}>{serverTranslate(locale, 'vouchers.goToStore')}</Link>
                </Button>
              ) : null}
            </div>

            {showClaimedBanner ? (
              <div className="rounded-[28px] border border-brand/20 bg-brand/10 p-4 text-sm font-semibold text-brand ring-1 ring-brand/10" dir="auto">
                {serverTranslate(locale, 'vouchers.claimedBanner')}
              </div>
            ) : null}

            <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-6 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-muted-foreground" dir="auto">
                    {storeName}
                  </p>
                  <h1 className="mt-1 text-xl font-bold text-[#2D2D2D]" dir="auto">
                    {offerTitle}
                  </h1>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
                  <StatusIcon className={cn('h-4 w-4', statusColor)} aria-hidden="true" />
                  <span dir="auto">{statusLabel}</span>
                </div>
              </div>

              <div className="mt-6 rounded-[28px] border border-white/60 bg-white/70 p-6 text-center shadow-sm ring-1 ring-black/5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {serverTranslate(locale, 'vouchers.codeLabel')}
                </p>
                <p className="mt-3 text-3xl font-extrabold tracking-[0.28em] text-[#2D2D2D]">{code}</p>
                <p className="mt-3 text-sm text-muted-foreground" dir="auto">
                  {serverTranslate(locale, 'vouchers.showToCashier')}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CopyCodeButton
                  code={code}
                  labels={{
                    copy: serverTranslate(locale, 'vouchers.copyCode'),
                    copiedTitle: serverTranslate(locale, 'vouchers.copiedTitle'),
                    copiedDescription: serverTranslate(locale, 'vouchers.copiedDescription'),
                    failedTitle: serverTranslate(locale, 'vouchers.copyFailedTitle'),
                    failedDescription: serverTranslate(locale, 'vouchers.copyFailedDescription'),
                  }}
                />

                <Button asChild variant="secondary" className="h-11 rounded-full bg-white text-primary shadow-sm hover:bg-white/90">
                  <Link href="/sponsors">{serverTranslate(locale, 'vouchers.browseSponsors')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

