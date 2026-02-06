'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BadgeCheck, Building2, Clock, Loader2, RefreshCcw, TicketCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLocale } from '@/providers/locale-provider';
import { PROTOTYPE_STORES, PROTOTYPE_VOUCHERS, type PrototypeVoucher } from '@/lib/prototypes/sponsors';

type RecentItem = {
  id: string;
  redeemedAt: Date;
  offerTitle: string;
};

function formatWhen(value: Date) {
  return format(value, 'PP p');
}

function cleanCode(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function makeRecent(vouchers: PrototypeVoucher[], storeId: string): RecentItem[] {
  return vouchers
    .filter((v) => v.store.id === storeId)
    .filter((v) => Boolean(v.redeemedAt))
    .map((v) => ({
      id: v.id,
      redeemedAt: v.redeemedAt ?? new Date(),
      offerTitle: v.offer.title,
    }))
    .sort((a, b) => b.redeemedAt.getTime() - a.redeemedAt.getTime())
    .slice(0, 10);
}

export default function PrototypePartnerRedeemPage() {
  const { t } = useLocale();

  const storeOptions = useMemo(() => PROTOTYPE_STORES.filter((s) => s.status === 'active'), []);
  const [storeId, setStoreId] = useState(storeOptions[0]?.id ?? '');
  const [codeInput, setCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [vouchers, setVouchers] = useState<PrototypeVoucher[]>(() => PROTOTYPE_VOUCHERS.map((v) => ({ ...v })));
  const [recent, setRecent] = useState<RecentItem[]>(() => makeRecent(PROTOTYPE_VOUCHERS, storeOptions[0]?.id ?? ''));
  const [recentLoading, setRecentLoading] = useState(false);

  const selectedStore = storeOptions.find((s) => s.id === storeId) ?? storeOptions[0] ?? null;

  const refreshRecent = async () => {
    if (!selectedStore) return;
    setRecentLoading(true);
    try {
      // Demo only: recompute from local prototype state.
      setRecent(makeRecent(vouchers, selectedStore.id));
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    void refreshRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStore) return;

    const cleaned = cleanCode(codeInput);
    if (cleaned.length < 4) {
      toast({ title: t('partnerRedeem.errors.invalidCode'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Demo only: redeem from local dataset.
      const match = vouchers.find((v) => v.code === cleaned);
      if (!match) {
        toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.codeNotFound'), variant: 'destructive' });
        return;
      }
      if (match.store.id !== selectedStore.id) {
        toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.notAuthorized'), variant: 'destructive' });
        return;
      }
      if (match.status === 'void') {
        toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.notRedeemable'), variant: 'destructive' });
        return;
      }
      const now = new Date();
      if (match.expiresAt && match.expiresAt.getTime() <= now.getTime()) {
        toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.voucherExpired'), variant: 'destructive' });
        return;
      }
      if (match.status === 'redeemed' || match.redeemedAt) {
        toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.alreadyRedeemed'), variant: 'destructive' });
        return;
      }

      setVouchers((prev) =>
        prev.map((v) =>
          v.id === match.id
            ? {
                ...v,
                status: 'redeemed',
                redeemedAt: now,
              }
            : v,
        ),
      );

      setRecent((prev) => [{ id: `r-${now.getTime()}`, redeemedAt: now, offerTitle: match.offer.title }, ...prev].slice(0, 10));
      setCodeInput('');
      toast({ title: t('partnerRedeem.toast.successTitle'), description: match.offer.title });
    } catch (error) {
      console.error('Prototype redeem failed', error);
      toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.generic'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pt-10 pb-12">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-7">
            <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
              {t('partnerRedeem.title')} (Prototype)
            </h1>
            <p className="mt-2 text-sm text-muted-foreground" dir="auto">
              {t('partnerRedeem.subtitle')} Try redeeming with this sample code: <span className="font-semibold">KU8H2K9T3Q</span>
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-[28px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-5 shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#2D2D2D]" dir="auto">
                    <TicketCheck className="h-4 w-4 text-brand" aria-hidden="true" />
                    {t('partnerRedeem.formTitle')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                    {t('partnerRedeem.formSubtitle')}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <span dir="auto">{t('partnerRedeem.staffOnly')}</span>
                </div>
              </div>

              <form onSubmit={handleRedeem} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="store" className="text-sm" dir="auto">
                    {t('partnerRedeem.storeLabel')}
                  </Label>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger id="store" className="h-12 rounded-2xl bg-white/80">
                      <SelectValue placeholder={t('partnerRedeem.storePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {storeOptions.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                            <span className="inline-flex items-center gap-2" dir="auto">
                              <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              <span className="font-medium">{store.name}</span>
                            {store.primaryCity ? <span className="text-muted-foreground">• {t(`header.city.${store.primaryCity}`)}</span> : null}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm" dir="auto">
                    {t('partnerRedeem.codeLabel')}
                  </Label>
                  <Input
                    id="code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder={t('partnerRedeem.codePlaceholder')}
                    className="h-12 rounded-2xl bg-white/80 font-semibold tracking-[0.12em]"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground" dir="auto">
                    {t('partnerRedeem.codeHint')}
                    {cleanCode(codeInput).length >= 4 ? (
                      <span className="ml-2 font-semibold text-[#2D2D2D]">{cleanCode(codeInput)}</span>
                    ) : null}
                  </p>
                </div>

                <Button type="submit" disabled={submitting} className="h-12 w-full rounded-2xl bg-brand text-white shadow-sm hover:bg-brand/90">
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {t('partnerRedeem.redeeming')}
                    </span>
                  ) : (
                    t('partnerRedeem.redeemButton')
                  )}
                </Button>

                <div className="rounded-2xl border border-white/60 bg-white/60 p-4 text-xs text-muted-foreground" dir="auto">
                  Prototype logic: code is validated against a known voucher list and must match the selected store. In production, the store staff account is store-scoped automatically.
                </div>
              </form>
            </div>

            <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#2D2D2D]" dir="auto">
                    {t('partnerRedeem.recentTitle')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                    {selectedStore?.name ?? t('partnerRedeem.recentSubtitle')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={cn('h-10 rounded-full bg-white/80', recentLoading ? 'pointer-events-none opacity-70' : '')}
                  onClick={() => void refreshRecent()}
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCcw className={cn('h-4 w-4', recentLoading ? 'animate-spin' : '')} aria-hidden="true" />
                    {t('partnerRedeem.refresh')}
                  </span>
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {recentLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span dir="auto">{t('partnerRedeem.loading')}</span>
                  </div>
                ) : recent.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-muted-foreground/25 bg-white/40 p-4 text-sm text-muted-foreground" dir="auto">
                    {t('partnerRedeem.recentEmpty')}
                  </div>
                ) : (
                  recent.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-white/50 bg-white/60 p-4 ring-1 ring-black/5"
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-[#2D2D2D]" dir="auto">
                          {item.offerTitle}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground" dir="auto">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatWhen(item.redeemedAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                        {t('partnerRedeem.redeemed')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
