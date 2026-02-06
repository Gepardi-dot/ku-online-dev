import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ar, ckb, enUS } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Ticket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales, type Locale } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';
import { PROTOTYPE_VOUCHERS, type PrototypeVoucher, type PrototypeVoucherStatus } from '@/lib/prototypes/sponsors';

type VoucherItem = {
  id: string;
  code: string;
  status: PrototypeVoucherStatus;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  claimedAt: Date;
  offerTitle: string;
  storeName: string;
  storeSlug: string | null;
};

function getDateFnsLocale(locale: Locale) {
  if (locale === 'ar') return ar;
  if (locale === 'ku') return ckb;
  return enUS;
}

function maskCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
}

function statusUi(status: PrototypeVoucherStatus) {
  if (status === 'redeemed') return { icon: CheckCircle2, cls: 'text-emerald-600', labelKey: 'vouchers.status.redeemed' };
  if (status === 'expired') return { icon: Clock, cls: 'text-amber-600', labelKey: 'vouchers.status.expired' };
  if (status === 'void') return { icon: AlertTriangle, cls: 'text-rose-600', labelKey: 'vouchers.status.void' };
  return { icon: Ticket, cls: 'text-brand', labelKey: 'vouchers.status.active' };
}

function normalizeStatus(input: PrototypeVoucher, now: Date): PrototypeVoucherStatus {
  if (input.status === 'redeemed') return 'redeemed';
  if (input.status === 'void') return 'void';
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

function VoucherCard({ item, locale }: { item: VoucherItem; locale: Locale }) {
  const StatusIcon = statusUi(item.status).icon;
  const statusLabel = serverTranslate(locale, statusUi(item.status).labelKey);

  const expiresLabel = item.expiresAt
    ? serverTranslate(locale, 'vouchers.expiresIn').replace(
        '{time}',
        formatDistanceToNow(item.expiresAt, { addSuffix: true, locale: getDateFnsLocale(locale) }),
      )
    : serverTranslate(locale, 'vouchers.noExpiry');

  return (
    <Link
      href={`/prototypes/vouchers/${item.id}`}
      className="group block overflow-hidden rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-[0_18px_52px_rgba(15,23,42,0.16)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#2D2D2D]" dir="auto">
            {item.storeName}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" dir="auto">
            {item.offerTitle}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
          <StatusIcon className={cn('h-4 w-4', statusUi(item.status).cls)} aria-hidden="true" />
          <span dir="auto">{statusLabel}</span>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {serverTranslate(locale, 'vouchers.codeLabel')}
          </p>
          <p className="mt-1 text-xl font-extrabold tracking-[0.22em] text-[#2D2D2D]">{maskCode(item.code)}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          {serverTranslate(locale, 'vouchers.view')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground" dir="auto">
        {expiresLabel}
      </p>
    </Link>
  );
}

function toItem(v: PrototypeVoucher, now: Date): VoucherItem {
  return {
    id: v.id,
    code: v.code,
    status: normalizeStatus(v, now),
    expiresAt: v.expiresAt,
    redeemedAt: v.redeemedAt,
    claimedAt: v.claimedAt,
    offerTitle: v.offer.title,
    storeName: v.store.name,
    storeSlug: v.store.slug ?? null,
  };
}

export default async function PrototypeVouchersPage() {
  const locale = await getServerLocale();
  const isRtl = rtlLocales.includes(locale);
  const now = new Date();

  const items = PROTOTYPE_VOUCHERS.map((v) => toItem(v, now));
  const active = items.filter((item) => item.status === 'active');
  const redeemed = items.filter((item) => item.status === 'redeemed');
  const expired = items.filter((item) => item.status === 'expired' || item.status === 'void');

  return (
    <section className="pt-10 pb-12">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" className="rounded-full">
              <Link href="/prototypes">
                <ArrowLeft className={cn('h-4 w-4', isRtl ? 'rotate-180' : null)} aria-hidden="true" />
                Back to showroom
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full bg-white/80">
              <Link href="/prototypes/sponsors">Browse sponsors</Link>
            </Button>
          </div>

          <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-7">
            <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
              Voucher wallet (Prototype)
            </h1>
            <p className="mt-2 text-sm text-muted-foreground" dir="auto">
              This is how the wallet looks in production. Users claim vouchers in the Sponsors hub and show the code in-store.
            </p>
          </div>

          <Tabs defaultValue="active">
            <TabsList className="w-full rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-black/5">
              <TabsTrigger value="active" className="flex-1 rounded-full">
                {serverTranslate(locale, 'vouchers.tabs.active')} ({active.length})
              </TabsTrigger>
              <TabsTrigger value="redeemed" className="flex-1 rounded-full">
                {serverTranslate(locale, 'vouchers.tabs.redeemed')} ({redeemed.length})
              </TabsTrigger>
              <TabsTrigger value="expired" className="flex-1 rounded-full">
                {serverTranslate(locale, 'vouchers.tabs.expired')} ({expired.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-6">
              {active.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {active.map((item) => (
                    <VoucherCard key={item.id} item={item} locale={locale} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 text-sm text-muted-foreground ring-1 ring-black/5" dir="auto">
                  Empty state example: no active vouchers.
                </div>
              )}
            </TabsContent>

            <TabsContent value="redeemed" className="mt-6">
              {redeemed.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {redeemed.map((item) => (
                    <VoucherCard key={item.id} item={item} locale={locale} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 text-sm text-muted-foreground ring-1 ring-black/5" dir="auto">
                  Empty state example: no redeemed vouchers.
                </div>
              )}
            </TabsContent>

            <TabsContent value="expired" className="mt-6">
              {expired.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {expired.map((item) => (
                    <VoucherCard key={item.id} item={item} locale={locale} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-white/60 bg-white/70 p-6 text-sm text-muted-foreground ring-1 ring-black/5" dir="auto">
                  Empty state example: no expired vouchers.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
