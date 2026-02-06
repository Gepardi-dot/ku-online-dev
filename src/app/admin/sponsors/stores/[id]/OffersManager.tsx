'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Edit3, ExternalLink, Loader2, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

export type SponsorOfferItem = {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  status: string;
  endAt: string | null;
  isFeatured: boolean;
  discountType: string | null;
  discountValue: number | string | null;
  currency: string | null;
  originalPrice: number | string | null;
  dealPrice: number | string | null;
};

type CreateOfferResponse = { ok: true; offer: { id: string } } | { ok: false; error?: string } | { ok?: false; error?: string };
type UpdateOfferResponse = { ok: true } | { ok: false; error?: string } | { ok?: false; error?: string };

function statusVariant(status: string) {
  const s = status.trim().toLowerCase();
  if (s === 'active') return 'default';
  if (s === 'paused') return 'secondary';
  if (s === 'expired' || s === 'archived') return 'outline';
  return 'secondary';
}

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

function OfferForm({
  mode,
  initial,
  onDone,
  storeId,
}: {
  mode: 'create' | 'edit';
  initial?: SponsorOfferItem | null;
  onDone: (next?: SponsorOfferItem | null) => void;
  storeId: string;
}) {
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [terms, setTerms] = useState(initial?.terms ?? '');
  const [status, setStatus] = useState<string>(initial?.status ?? 'active');
  const [isFeatured, setIsFeatured] = useState(Boolean(initial?.isFeatured ?? false));
  const [discountType, setDiscountType] = useState<string>(initial?.discountType ?? 'custom');
  const [discountValue, setDiscountValue] = useState<string>(initial?.discountValue != null ? String(initial.discountValue) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? '');
  const [originalPrice, setOriginalPrice] = useState<string>(initial?.originalPrice != null ? String(initial.originalPrice) : '');
  const [dealPrice, setDealPrice] = useState<string>(initial?.dealPrice != null ? String(initial.dealPrice) : '');
  const [endAtLocal, setEndAtLocal] = useState(fromIsoToLocalInput(initial?.endAt ?? null));

  const submitLabel = mode === 'create' ? 'Create offer' : 'Save offer';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim().length < 2) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const res = await fetch(`/api/admin/sponsors/stores/${encodeURIComponent(storeId)}/offers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
	          body: JSON.stringify({
	            title: title.trim(),
	            description: description.trim() || null,
	            terms: terms.trim() || null,
	            status,
	            isFeatured,
	            discountType,
	            discountValue: discountValue.trim() ? Number(discountValue.trim()) : null,
	            currency: currency.trim() || null,
	            originalPrice: originalPrice.trim() ? Number(originalPrice.trim()) : null,
	            dealPrice: dealPrice.trim() ? Number(dealPrice.trim()) : null,
	            endAt: toIsoFromLocalInput(endAtLocal),
	          }),
	        });
        const payload = (await res.json().catch(() => ({}))) as CreateOfferResponse;
        if (!res.ok || !payload.ok) {
          const message = typeof (payload as any)?.error === 'string' ? (payload as any).error : undefined;
          toast({ title: 'Could not create offer', description: message ?? 'Please try again.', variant: 'destructive' });
          return;
        }
        toast({ title: 'Offer created' });
	        onDone({
	          id: payload.offer.id,
	          title: title.trim(),
	          description: description.trim() || null,
	          terms: terms.trim() || null,
	          status,
	          endAt: toIsoFromLocalInput(endAtLocal),
	          isFeatured,
	          discountType,
	          discountValue: discountValue.trim() ? Number(discountValue.trim()) : null,
	          currency: currency.trim() || null,
	          originalPrice: originalPrice.trim() ? Number(originalPrice.trim()) : null,
	          dealPrice: dealPrice.trim() ? Number(dealPrice.trim()) : null,
	        });
        return;
      }

      const offerId = initial?.id;
      if (!offerId) return;

      const res = await fetch(`/api/admin/sponsors/offers/${encodeURIComponent(offerId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
	        body: JSON.stringify({
	          title: title.trim(),
	          description: description.trim() || null,
	          terms: terms.trim() || null,
	          status,
	          isFeatured,
	          discountType,
	          discountValue: discountValue.trim() ? Number(discountValue.trim()) : null,
	          currency: currency.trim() || null,
	          originalPrice: originalPrice.trim() ? Number(originalPrice.trim()) : null,
	          dealPrice: dealPrice.trim() ? Number(dealPrice.trim()) : null,
	          endAt: toIsoFromLocalInput(endAtLocal),
	        }),
	      });
      const payload = (await res.json().catch(() => ({}))) as UpdateOfferResponse;
      if (!res.ok || !payload.ok) {
        const message = typeof (payload as any)?.error === 'string' ? (payload as any).error : undefined;
        toast({ title: 'Could not save offer', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Offer saved' });
	      onDone({
	        id: offerId,
	        title: title.trim(),
	        description: description.trim() || null,
	        terms: terms.trim() || null,
	        status,
	        endAt: toIsoFromLocalInput(endAtLocal),
	        isFeatured,
	        discountType,
	        discountValue: discountValue.trim() ? Number(discountValue.trim()) : null,
	        currency: currency.trim() || null,
	        originalPrice: originalPrice.trim() ? Number(originalPrice.trim()) : null,
	        dealPrice: dealPrice.trim() ? Number(dealPrice.trim()) : null,
	      });
    } catch (error) {
      console.error('Offer submit failed', error);
      toast({ title: 'Request failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${mode}-title`}>Title</Label>
        <Input id={`${mode}-title`} value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-2xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="paused">paused</SelectItem>
              <SelectItem value="draft">draft</SelectItem>
              <SelectItem value="expired">expired</SelectItem>
              <SelectItem value="archived">archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>End date (optional)</Label>
          <Input type="datetime-local" value={endAtLocal} onChange={(e) => setEndAtLocal(e.target.value)} className="h-11 rounded-2xl" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-1">
          <Label>Discount type</Label>
          <Select value={discountType} onValueChange={setDiscountType}>
            <SelectTrigger className="h-11 rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">custom</SelectItem>
              <SelectItem value="percent">percent</SelectItem>
              <SelectItem value="amount">amount</SelectItem>
              <SelectItem value="freebie">freebie</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-1">
          <Label>Value</Label>
          <Input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="e.g. 10" className="h-11 rounded-2xl" />
        </div>
        <div className="space-y-2 md:col-span-1">
          <Label>Currency</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="IQD" className="h-11 rounded-2xl" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Original price (optional)</Label>
          <Input
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            placeholder="e.g. 150"
            className="h-11 rounded-2xl"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-2">
          <Label>Deal price (optional)</Label>
          <Input
            value={dealPrice}
            onChange={(e) => setDealPrice(e.target.value)}
            placeholder="e.g. 120"
            className="h-11 rounded-2xl"
            inputMode="decimal"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border bg-white/40 p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Featured offer</p>
          <p className="text-xs text-muted-foreground">Shows in “Top offers” section.</p>
        </div>
        <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-24 rounded-2xl" />
      </div>
      <div className="space-y-2">
        <Label>Terms (optional)</Label>
        <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} className="min-h-24 rounded-2xl" />
      </div>

      <Button type="submit" disabled={submitting} className="h-11 rounded-2xl">
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Saving…
          </span>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}

function EditOfferDialog({
  storeId,
  offer,
  onUpdated,
}: {
  storeId: string;
  offer: SponsorOfferItem;
  onUpdated: (offer: SponsorOfferItem) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full bg-white/80">
          <span className="inline-flex items-center gap-2">
            <Edit3 className="h-4 w-4" aria-hidden="true" />
            Edit
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit offer</DialogTitle>
        </DialogHeader>
        <OfferForm
          mode="edit"
          initial={offer}
          storeId={storeId}
          onDone={(next) => {
            if (next) onUpdated(next);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function OffersManager({ storeId, initialOffers }: { storeId: string; initialOffers: SponsorOfferItem[] }) {
  const [offers, setOffers] = useState<SponsorOfferItem[]>(initialOffers);
  const [createOpen, setCreateOpen] = useState(false);

  const sorted = useMemo(() => offers.slice().sort((a, b) => (b.endAt ?? '').localeCompare(a.endAt ?? '')), [offers]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Create, pause, or feature offers for this store.</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full">
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New offer
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>New offer</DialogTitle>
            </DialogHeader>
            <OfferForm
              mode="create"
              storeId={storeId}
              onDone={(next) => {
                if (next) setOffers((prev) => [next, ...prev]);
                setCreateOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {offers.length === 0 ? (
        <div className="text-sm text-muted-foreground">No offers yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Offer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((offer) => {
              const endsIn =
                offer.endAt && !Number.isNaN(new Date(offer.endAt).getTime())
                  ? formatDistanceToNow(new Date(offer.endAt), { addSuffix: true })
                  : '—';
              return (
                <TableRow key={offer.id}>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{offer.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {offer.discountType}
                        {offer.discountValue != null ? ` • ${offer.discountValue}` : ''}
                        {offer.currency ? ` ${offer.currency}` : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(offer.status) as any}>{offer.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{endsIn}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{offer.isFeatured ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" className="rounded-full bg-white/80">
                        <Link href={`/sponsors/offers/${offer.id}`} target="_blank" rel="noreferrer">
                          <span className="inline-flex items-center gap-2">
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            View
                          </span>
                        </Link>
                      </Button>
                      <EditOfferDialog
                        storeId={storeId}
                        offer={offer}
                        onUpdated={(next) => setOffers((prev) => prev.map((o) => (o.id === next.id ? { ...o, ...next } : o)))}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
