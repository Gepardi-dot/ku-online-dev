'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BadgeCheck, Building2, Clock, Loader2, RefreshCcw, TicketCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLocale } from '@/providers/locale-provider';

export type PartnerStoreOption = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  status: string | null;
  role: string;
  logoUrl: string | null;
};

export type RecentRedemptionItem = {
  id: string;
  redeemedAt: string | null;
  offerId: string | null;
  offerTitle: string | null;
};

type RedemptionResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  redemption?: {
    id: string;
    claimId: string;
    redeemedAt: string | null;
    storeId: string;
    offerId: string | null;
    offerTitle: string | null;
  };
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  items?: RecentRedemptionItem[];
};

function formatWhen(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'PP p');
}

function cleanCode(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function mapPartnerError(t: (key: string) => string, payload: RedemptionResponse): string {
  const rpcCode = typeof payload.code === 'string' ? payload.code.trim() : '';
  if (rpcCode === 'NOT_AUTHORIZED') return t('partnerRedeem.errors.notAuthorized');
  if (rpcCode === 'INVALID_CODE') return t('partnerRedeem.errors.invalidCode');
  if (rpcCode === 'CODE_NOT_FOUND') return t('partnerRedeem.errors.codeNotFound');
  if (rpcCode === 'ALREADY_REDEEMED') return t('partnerRedeem.errors.alreadyRedeemed');
  if (rpcCode === 'VOUCHER_EXPIRED') return t('partnerRedeem.errors.voucherExpired');
  if (rpcCode === 'STORE_DISABLED') return t('partnerRedeem.errors.storeUnavailable');
  if (rpcCode === 'OFFER_EXPIRED') return t('partnerRedeem.errors.offerExpired');
  if (rpcCode === 'OFFER_SOLD_OUT') return t('partnerRedeem.errors.offerSoldOut');
  if (rpcCode === 'REDEMPTION_LIMIT_REACHED') return t('partnerRedeem.errors.redemptionLimitReached');
  if (rpcCode === 'NOT_REDEEMABLE') return t('partnerRedeem.errors.notRedeemable');
  return typeof payload.error === 'string' && payload.error.trim() ? payload.error : t('partnerRedeem.errors.generic');
}

export default function RedeemForm({
  stores,
  initialStoreId,
  initialRecent,
}: {
  stores: PartnerStoreOption[];
  initialStoreId: string;
  initialRecent: RecentRedemptionItem[];
}) {
  const router = useRouter();
  const { t } = useLocale();

  const storeOptions = useMemo(() => stores, [stores]);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [codeInput, setCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recent, setRecent] = useState<RecentRedemptionItem[]>(initialRecent);

  const selectedStore = storeOptions.find((s) => s.id === storeId) ?? storeOptions[0];

  const refreshRecent = async (nextStoreId: string) => {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/partner/redemptions?storeId=${encodeURIComponent(nextStoreId)}&limit=10`);
      const payload = (await res.json().catch(() => ({}))) as ListResponse;
      if (!res.ok || !payload.ok) {
        setRecent([]);
        return;
      }
      setRecent(Array.isArray(payload.items) ? payload.items : []);
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    if (storeId !== initialStoreId) {
      void refreshRecent(storeId);
    }
    router.replace(`/partner/redeem?storeId=${encodeURIComponent(storeId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = cleanCode(codeInput);
    if (!selectedStore?.id || cleaned.length < 4) {
      toast({ title: t('partnerRedeem.errors.invalidCode'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/partner/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: selectedStore.id, code: cleaned }),
      });
      const payload = (await res.json().catch(() => ({}))) as RedemptionResponse;

      if (!res.ok || !payload.ok) {
        const msg = mapPartnerError(t, payload);
        toast({ title: t('partnerRedeem.toast.failedTitle'), description: msg, variant: 'destructive' });
        return;
      }

      toast({
        title: t('partnerRedeem.toast.successTitle'),
        description: payload.redemption?.offerTitle ?? t('partnerRedeem.toast.successDescription'),
      });
      setCodeInput('');
      await refreshRecent(selectedStore.id);
    } catch (error) {
      console.error('Failed to redeem voucher', error);
      toast({ title: t('partnerRedeem.toast.failedTitle'), description: t('partnerRedeem.errors.generic'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
                      {store.city ? <span className="text-muted-foreground">• {store.city}</span> : null}
                      <span className="text-muted-foreground">• {store.role}</span>
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

          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-2xl bg-brand text-white shadow-sm hover:bg-brand/90"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('partnerRedeem.redeeming')}
              </span>
            ) : (
              t('partnerRedeem.redeemButton')
            )}
          </Button>
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
            onClick={() => void refreshRecent(storeId)}
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
                    {item.offerTitle ?? t('partnerRedeem.unknownOffer')}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground" dir="auto">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatWhen(item.redeemedAt) ?? t('partnerRedeem.unknownTime')}
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
  );
}

