import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, Ticket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';
import { CopyCodeButton } from '@/components/sponsors/CopyCodeButton';
import { getPrototypeVoucherById, type PrototypeVoucherStatus } from '@/lib/prototypes/sponsors';

function statusUi(status: PrototypeVoucherStatus, locale: 'en' | 'ar' | 'ku') {
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

  return { statusLabel, StatusIcon, statusColor };
}

export default async function PrototypeVoucherDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ claimed?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};

  const locale = await getServerLocale();
  const isRtl = rtlLocales.includes(locale);
  const now = new Date();

  const voucher = getPrototypeVoucherById(id);
  if (!voucher) {
    notFound();
  }

  const status: PrototypeVoucherStatus =
    voucher.status === 'redeemed'
      ? 'redeemed'
      : voucher.status === 'void'
        ? 'void'
        : voucher.expiresAt && voucher.expiresAt.getTime() <= now.getTime()
          ? 'expired'
          : 'active';

  const storeName = voucher.store.name ?? serverTranslate(locale, 'vouchers.unknownStore');
  const storeSlug = voucher.store.slug ?? null;
  const offerTitle = voucher.offer.title ?? serverTranslate(locale, 'vouchers.unknownOffer');

  const { statusLabel, StatusIcon, statusColor } = statusUi(status, locale);
  const showClaimedBanner = sp.claimed === '1';

  return (
    <section className="pt-10 pb-12">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="ghost" className="rounded-full">
              <Link href="/prototypes/vouchers">
                <ArrowLeft className={cn('h-4 w-4', isRtl ? 'rotate-180' : null)} aria-hidden="true" />
                {serverTranslate(locale, 'vouchers.back')}
              </Link>
            </Button>
            {storeSlug ? (
              <Button asChild variant="link" className="text-primary font-semibold">
                <Link href={`/prototypes/sponsors/stores/${storeSlug}`}>{serverTranslate(locale, 'vouchers.goToStore')}</Link>
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
              <p className="mt-3 text-3xl font-extrabold tracking-[0.28em] text-[#2D2D2D]">{voucher.code}</p>
              <p className="mt-3 text-sm text-muted-foreground" dir="auto">
                {serverTranslate(locale, 'vouchers.showToCashier')}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CopyCodeButton
                code={voucher.code}
                labels={{
                  copy: serverTranslate(locale, 'vouchers.copyCode'),
                  copiedTitle: serverTranslate(locale, 'vouchers.copiedTitle'),
                  copiedDescription: serverTranslate(locale, 'vouchers.copiedDescription'),
                  failedTitle: serverTranslate(locale, 'vouchers.copyFailedTitle'),
                  failedDescription: serverTranslate(locale, 'vouchers.copyFailedDescription'),
                }}
              />

              <Button asChild variant="secondary" className="h-11 rounded-full bg-white text-primary shadow-sm hover:bg-white/90">
                <Link href="/prototypes/sponsors">{serverTranslate(locale, 'vouchers.browseSponsors')}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 text-sm text-muted-foreground ring-1 ring-black/5" dir="auto">
            Prototype note: In production, this voucher comes from the user’s real wallet after a claim and can be redeemed only by store staff.
          </div>
        </div>
      </div>
    </section>
  );
}

