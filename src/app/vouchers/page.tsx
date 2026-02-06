import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ar, ckb, enUS } from 'date-fns/locale';
import { Ticket, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClient } from '@/utils/supabase/server';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { rtlLocales, type Locale } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';

type VoucherClaimRow = {
  id: string;
  code: string | null;
  status: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  created_at: string | null;
  offer: {
    id: string;
    title: string | null;
    discount_type: string | null;
    discount_value: number | string | null;
    currency: string | null;
    end_at: string | null;
    store: {
      id: string;
      name: string | null;
      slug: string | null;
      logo_url: string | null;
      primary_city: string | null;
    } | null;
  } | null;
};

type VoucherStatus = 'active' | 'redeemed' | 'expired' | 'void';

type VoucherItem = {
  id: string;
  code: string;
  status: VoucherStatus;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date | null;
  offerTitle: string;
  storeName: string;
  storeSlug: string | null;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toVoucherStatus(row: VoucherClaimRow, now: Date): VoucherStatus {
  const raw = (row.status ?? '').trim().toLowerCase();
  if (raw === 'redeemed') return 'redeemed';
  if (raw === 'void') return 'void';
  if (raw === 'expired') return 'expired';

  const expiresAt = toDate(row.expires_at);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

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

function statusUi(status: VoucherStatus) {
  if (status === 'redeemed') return { icon: CheckCircle2, cls: 'text-emerald-600', labelKey: 'vouchers.status.redeemed' };
  if (status === 'expired') return { icon: Clock, cls: 'text-amber-600', labelKey: 'vouchers.status.expired' };
  if (status === 'void') return { icon: AlertTriangle, cls: 'text-rose-600', labelKey: 'vouchers.status.void' };
  return { icon: Ticket, cls: 'text-brand', labelKey: 'vouchers.status.active' };
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
      href={`/vouchers/${item.id}`}
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
          <p className="mt-1 text-xl font-extrabold tracking-[0.22em] text-[#2D2D2D]">
            {maskCode(item.code)}
          </p>
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

export default async function VouchersPage() {
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
      created_at,
      offer:sponsor_offers(
        id,
        title,
        discount_type,
        discount_value,
        currency,
        end_at,
        store:sponsor_stores(
          id,
          name,
          slug,
          logo_url,
          primary_city
        )
      )
    `,
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to load voucher claims', error);
  }

  const rows = (data ?? []) as unknown as VoucherClaimRow[];
  const items: VoucherItem[] = rows
    .map((row) => {
      const offerTitle = row.offer?.title ?? serverTranslate(locale, 'vouchers.unknownOffer');
      const storeName = row.offer?.store?.name ?? serverTranslate(locale, 'vouchers.unknownStore');
      const storeSlug = row.offer?.store?.slug ?? null;
      const code = (row.code ?? '').trim();
      const status = toVoucherStatus(row, now);

      return {
        id: row.id,
        code: code || '—',
        status,
        expiresAt: toDate(row.expires_at),
        redeemedAt: toDate(row.redeemed_at),
        createdAt: toDate(row.created_at),
        offerTitle,
        storeName,
        storeSlug,
      };
    })
    .filter((item) => item.code !== '—');

  const active = items.filter((item) => item.status === 'active');
  const redeemed = items.filter((item) => item.status === 'redeemed');
  const expired = items.filter((item) => item.status === 'expired' || item.status === 'void');

  return (
    <AppLayout user={user}>
      <section className="pt-10 pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-7">
              <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
                {serverTranslate(locale, 'vouchers.title')}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                {serverTranslate(locale, 'vouchers.subtitle')}
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

              <TabsContent value="active" className="mt-4">
                {active.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {active.map((item) => (
                      <VoucherCard key={item.id} item={item} locale={locale} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-7 text-center shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
                    <Ticket className="mx-auto h-10 w-10 text-brand" aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-[#2D2D2D]" dir="auto">
                      {serverTranslate(locale, 'vouchers.empty.activeTitle')}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground" dir="auto">
                      {serverTranslate(locale, 'vouchers.empty.activeDescription')}
                    </p>
                    <div className="mt-5 flex justify-center">
                      <Button asChild className="rounded-full px-6 font-semibold">
                        <Link href="/sponsors">{serverTranslate(locale, 'vouchers.browseSponsors')}</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="redeemed" className="mt-4">
                {redeemed.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {redeemed.map((item) => (
                      <VoucherCard key={item.id} item={item} locale={locale} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-white/60 bg-white/70 p-7 text-center shadow-sm ring-1 ring-black/5">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-[#2D2D2D]" dir="auto">
                      {serverTranslate(locale, 'vouchers.empty.redeemedTitle')}
                    </h2>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="expired" className="mt-4">
                {expired.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {expired.map((item) => (
                      <VoucherCard key={item.id} item={item} locale={locale} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-white/60 bg-white/70 p-7 text-center shadow-sm ring-1 ring-black/5">
                    <Clock className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
                    <h2 className="mt-3 text-lg font-bold text-[#2D2D2D]" dir="auto">
                      {serverTranslate(locale, 'vouchers.empty.expiredTitle')}
                    </h2>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className={cn('text-center', isRtl ? 'rtl' : 'ltr')}>
              <Button asChild variant="link" className="text-primary font-semibold">
                <Link href="/sponsors">{serverTranslate(locale, 'vouchers.browseSponsors')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

