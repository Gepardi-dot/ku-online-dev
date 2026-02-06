'use client';

import { FormEvent, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Edit3, Loader2, Plus, Trash2 } from 'lucide-react';

import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorOffer } from '@/lib/services/sponsors';
import { SponsorStoreServiceCard } from '@/components/sponsors/SponsorStoreServiceCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type SponsorServiceDiscountType = 'percent' | 'amount' | 'freebie' | 'custom';

export type SponsorServiceItem = {
  id: string;
  title: string;
  description: string | null;
  discountType: SponsorServiceDiscountType;
  discountValue: number | string | null;
  currency: string | null;
  endAt: string | null;
  status: string;
};

type StoreInfo = { id: string; name: string; slug: string };

type CreateResponse =
  | { ok: true; offer: SponsorServiceItem }
  | { ok: false; error?: string }
  | { ok?: false; error?: string };

type UpdateResponse =
  | { ok: true; offer: SponsorServiceItem }
  | { ok: false; error?: string }
  | { ok?: false; error?: string };

type DeleteResponse =
  | { ok: true }
  | { ok: false; error?: string }
  | { ok?: false; error?: string };

function toIsoFromLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fromIsoToLocalInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toOfferForCard(item: SponsorServiceItem, storeId: string): SponsorOffer {
  const toNumber = (value: number | string | null) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  return {
    id: item.id,
    storeId,
    title: item.title,
    description: item.description ?? null,
    discountType: item.discountType,
    discountValue: toNumber(item.discountValue),
    currency: item.currency ?? null,
    endAt: item.endAt ? new Date(item.endAt) : null,
    store: null,
  };
}

function statusLabel(status: string) {
  const s = status.trim().toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'paused') return 'Paused';
  if (s === 'draft') return 'Draft';
  if (s === 'archived') return 'Archived';
  if (s === 'expired') return 'Expired';
  return status || '—';
}

function isActiveStatus(status: string) {
  return status.trim().toLowerCase() === 'active';
}

function ServiceForm({
  mode,
  initial,
  onSubmit,
  submitting,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<SponsorServiceItem> | null;
  submitting: boolean;
  onSubmit: (payload: {
    title: string;
    description: string | null;
    discountType: SponsorServiceDiscountType;
    discountValue: number | null;
    currency: string | null;
    endAt: string | null;
    status?: 'active' | 'paused';
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [discountType, setDiscountType] = useState<SponsorServiceDiscountType>(initial?.discountType ?? 'percent');
  const [discountValue, setDiscountValue] = useState(
    initial?.discountValue != null ? String(initial.discountValue) : '',
  );
  const [currency, setCurrency] = useState(initial?.currency ?? 'IQD');
  const [endAtLocal, setEndAtLocal] = useState(fromIsoToLocalInput(initial?.endAt ?? null));
  const [noExpiry, setNoExpiry] = useState(!initial?.endAt);
  const [active, setActive] = useState(
    initial?.status ? isActiveStatus(initial.status) : true,
  );

  const showValue = discountType === 'percent' || discountType === 'amount';
  const showCurrency = discountType === 'amount';

  const submitLabel = mode === 'create' ? 'Add service' : 'Save';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanedTitle = title.trim();
    if (cleanedTitle.length < 2) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    const valueNum = showValue && discountValue.trim() !== '' ? Number(discountValue.trim()) : null;
    if (showValue && discountValue.trim() !== '' && !Number.isFinite(valueNum as any)) {
      toast({ title: 'Enter a valid number', variant: 'destructive' });
      return;
    }

    if (discountType === 'percent' && typeof valueNum === 'number' && (valueNum <= 0 || valueNum > 100)) {
      toast({ title: 'Percent must be between 1 and 100', variant: 'destructive' });
      return;
    }

    onSubmit({
      title: cleanedTitle,
      description: description.trim() ? description.trim() : null,
      discountType,
      discountValue: valueNum,
      currency: showCurrency ? (currency.trim() ? currency.trim() : null) : null,
      endAt: noExpiry ? null : toIsoFromLocalInput(endAtLocal),
      status: active ? 'active' : 'paused',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-2">
          <Label htmlFor={`${mode}-title`}>Title</Label>
          <Input
            id={`${mode}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 20% off phone cases"
            className="h-11 rounded-xl bg-white/80"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Deal</Label>
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as SponsorServiceDiscountType)}>
              <SelectTrigger className="h-11 rounded-xl bg-white/80">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent off</SelectItem>
                <SelectItem value="amount">Amount off</SelectItem>
                <SelectItem value="freebie">Freebie</SelectItem>
                <SelectItem value="custom">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{discountType === 'amount' ? 'Value' : discountType === 'percent' ? 'Percent' : 'Value'}</Label>
            <Input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              inputMode="decimal"
              placeholder={showValue ? (discountType === 'percent' ? '20' : '5000') : '—'}
              disabled={!showValue}
              className="h-11 rounded-xl bg-white/80"
            />
          </div>
        </div>
      </div>

      {showCurrency ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-11 rounded-xl bg-white/80">
                <SelectValue placeholder="IQD" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IQD">IQD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ends (optional)</Label>
            <Input
              type="datetime-local"
              value={endAtLocal}
              onChange={(e) => setEndAtLocal(e.target.value)}
              disabled={noExpiry}
              className="h-11 rounded-xl bg-white/80"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ends (optional)</Label>
            <Input
              type="datetime-local"
              value={endAtLocal}
              onChange={(e) => setEndAtLocal(e.target.value)}
              disabled={noExpiry}
              className="h-11 rounded-xl bg-white/80"
            />
          </div>
          <div className="flex items-end justify-between gap-3 rounded-xl border border-black/10 bg-white/60 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#111827]">Active</p>
              <p className="text-xs text-muted-foreground">Turn off to hide it.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Toggle active" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <input
            type="checkbox"
            checked={noExpiry}
            onChange={(e) => setNoExpiry(e.target.checked)}
            className="h-4 w-4 rounded border-black/20"
          />
          No expiry
        </label>

        <Button type="submit" disabled={submitting} className="rounded-full">
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {submitLabel}
            </span>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${mode}-desc`}>Description (optional)</Label>
        <Textarea
          id={`${mode}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short details. Keep it simple."
          className="min-h-[90px] rounded-xl bg-white/80"
        />
      </div>
    </form>
  );
}

function EditServiceDialog({
  item,
  onUpdated,
  mode,
}: {
  item: SponsorServiceItem;
  onUpdated: (next: SponsorServiceItem) => void;
  mode: 'remote' | 'mock';
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateService = async (payload: Parameters<typeof ServiceForm>[0]['onSubmit'] extends (p: infer P) => void ? P : never) => {
    if (mode === 'mock') {
      const next: SponsorServiceItem = {
        ...item,
        title: payload.title,
        description: payload.description ?? null,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        currency: payload.currency ?? null,
        endAt: payload.endAt ?? null,
        status: payload.status ?? item.status,
      };
      onUpdated(next);
      setOpen(false);
      toast({ title: 'Saved' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sponsors/services/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as UpdateResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: 'Failed to save', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      onUpdated(data.offer);
      setOpen(false);
      toast({ title: 'Saved' });
    } catch (error) {
      console.error('Failed to update service', error);
      toast({ title: 'Failed to save', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full bg-white/70">
          <span className="inline-flex items-center gap-2">
            <Edit3 className="h-4 w-4" aria-hidden="true" />
            Edit
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit service</DialogTitle>
        </DialogHeader>
        <ServiceForm mode="edit" initial={item} submitting={submitting} onSubmit={updateService} />
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

export function SponsorServicesManager({
  store,
  initialItems,
  locale,
  sponsoredLabel,
  endsLabel,
  mode = 'remote',
}: {
  store: StoreInfo;
  initialItems: SponsorServiceItem[];
  locale: Locale;
  sponsoredLabel: string;
  endsLabel: (time: string) => string;
  mode?: 'remote' | 'mock';
}) {
  const [items, setItems] = useState<SponsorServiceItem[]>(initialItems ?? []);
  const [submitting, setSubmitting] = useState(false);

  const sorted = useMemo(() => {
    const score = (item: SponsorServiceItem) => {
      const s = item.status.trim().toLowerCase();
      if (s === 'active') return 0;
      if (s === 'paused') return 1;
      if (s === 'draft') return 2;
      return 3;
    };
    return items
      .slice()
      .sort((a, b) => score(a) - score(b) || (b.endAt ?? '').localeCompare(a.endAt ?? ''));
  }, [items]);

  const createService = async (payload: Parameters<typeof ServiceForm>[0]['onSubmit'] extends (p: infer P) => void ? P : never) => {
    if (mode === 'mock') {
      setSubmitting(true);
      try {
        const id = `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const next: SponsorServiceItem = {
          id,
          title: payload.title,
          description: payload.description ?? null,
          discountType: payload.discountType,
          discountValue: payload.discountValue,
          currency: payload.currency ?? null,
          endAt: payload.endAt ?? null,
          status: payload.status ?? 'active',
        };
        setItems((prev) => [next, ...prev]);
        toast({ title: 'Service added' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/sponsors/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as CreateResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: 'Failed to add service', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      setItems((prev) => [data.offer, ...prev]);
      toast({ title: 'Service added' });
    } catch (error) {
      console.error('Failed to create service', error);
      toast({ title: 'Failed to add service', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteService = async (id: string) => {
    const ok = window.confirm('Delete this service?');
    if (!ok) return;
    if (mode === 'mock') {
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast({ title: 'Deleted' });
      return;
    }
    try {
      const res = await fetch(`/api/sponsors/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as DeleteResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: 'Delete failed', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast({ title: 'Deleted' });
    } catch (error) {
      console.error('Failed to delete service', error);
      toast({ title: 'Delete failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const toggleActive = async (item: SponsorServiceItem, nextActive: boolean) => {
    const nextStatus = nextActive ? 'active' : 'paused';
    // Optimistic UI.
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row)));
    if (mode === 'mock') {
      return;
    }
    try {
      const res = await fetch(`/api/sponsors/services/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json().catch(() => ({}))) as UpdateResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        throw new Error(message ?? 'Failed');
      }
      setItems((prev) => prev.map((row) => (row.id === item.id ? data.offer : row)));
    } catch (error) {
      console.error('Failed to toggle status', error);
      // Revert.
      setItems((prev) => prev.map((row) => (row.id === item.id ? item : row)));
      toast({ title: 'Update failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-[24px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 shadow-[0_10px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
        <CardHeader>
          <CardTitle className="text-brand">Add a service</CardTitle>
          <p className="text-sm text-muted-foreground">
            Keep it short. This shows under the <span className="font-semibold">Services</span> tab on your store page.
          </p>
        </CardHeader>
        <CardContent>
          <ServiceForm mode="create" submitting={submitting} onSubmit={createService} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-[#111827]">Your services</h2>
            <p className="text-sm text-muted-foreground">Active services appear immediately.</p>
          </div>
          <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-black/5">
            {items.length}
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-[18px] border border-white/70 bg-white/75 p-4 text-sm text-muted-foreground shadow-[0_10px_30px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
            No services yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((item) => {
              const offer = toOfferForCard(item, store.id);
              const endsIn =
                item.endAt && !Number.isNaN(new Date(item.endAt).getTime())
                  ? formatDistanceToNow(new Date(item.endAt), { addSuffix: true })
                  : null;
              const active = isActiveStatus(item.status);

              return (
                <div key={item.id} className="space-y-2">
                  <div className={cn(!active ? 'opacity-70' : '')}>
                    <SponsorStoreServiceCard
                      offer={offer}
                      locale={locale}
                      sponsoredLabel={sponsoredLabel}
                      endsLabel={endsLabel}
                      href={null}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-xs shadow-sm ring-1 ring-black/5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-black/5 px-2 py-1 font-extrabold text-[#111827] ring-1 ring-black/5">
                        {statusLabel(item.status)}
                      </span>
                      {endsIn ? (
                        <span className="text-muted-foreground" dir="auto">
                          Ends {endsIn}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active}
                        onCheckedChange={(checked) => void toggleActive(item, checked)}
                        aria-label="Toggle service visibility"
                      />
                      <EditServiceDialog
                        item={item}
                        mode={mode}
                        onUpdated={(next) => setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full bg-white/70"
                        onClick={() => void deleteService(item.id)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
