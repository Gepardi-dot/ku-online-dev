'use client';

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Edit3, ImagePlus, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';

import type { Locale } from '@/lib/locale/dictionary';
import type { SponsorOffer } from '@/lib/services/sponsors';
import { SponsorStoreServiceCard } from '@/components/sponsors/SponsorStoreServiceCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';

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

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  coverUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  directionsUrl?: string | null;
};

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

type StoreSnapshot = {
  id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  directionsUrl: string | null;
};

type UpdateStoreResponse =
  | {
      ok: true;
      store: StoreSnapshot;
    }
  | { ok: false; error?: string }
  | { ok?: false; error?: string };

type DeleteStoreResponse =
  | { ok: true; deletedStoreId: string }
  | { ok: false; error?: string }
  | { ok?: false; error?: string };

type StorePatchPayload = {
  coverUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  directionsUrl?: string | null;
};

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
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

function withStoreId(path: string, storeId: string, include = true): string {
  if (!include) return path;
  const target = storeId.trim();
  if (!target) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}storeId=${encodeURIComponent(target)}`;
}

const ACCEPTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_STORE_CARD_ASPECT_RATIO = 16 / 9;
const MIN_STORE_CARD_ASPECT_RATIO = 0.65;
const MAX_STORE_CARD_ASPECT_RATIO = 2.8;
const MAX_OFFERS_PER_STORE = 3;
const UNLIMITED_OFFERS_LABEL = 'unlimited';
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

function resolveUploadExtension(file: File): 'jpg' | 'png' | 'webp' | 'avif' | null {
  const normalizedType = (file.type || '').toLowerCase();
  if (normalizedType === 'image/jpeg' || normalizedType === 'image/jpg') {
    return 'jpg';
  }
  if (normalizedType === 'image/png') {
    return 'png';
  }
  if (normalizedType === 'image/webp') {
    return 'webp';
  }
  if (normalizedType === 'image/avif') {
    return 'avif';
  }

  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'jpg';
  }
  if (extension === 'png' || extension === 'webp' || extension === 'avif') {
    return extension;
  }

  return null;
}

function normalizeStoreCardAspectRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_STORE_CARD_ASPECT_RATIO;
  }
  const ratio = width / height;
  return Math.min(MAX_STORE_CARD_ASPECT_RATIO, Math.max(MIN_STORE_CARD_ASPECT_RATIO, ratio));
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
  }) => Promise<boolean> | boolean;
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

  const submitLabel = mode === 'create' ? 'Add offer' : 'Save';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    const didSave = await onSubmit({
      title: cleanedTitle,
      description: description.trim() ? description.trim() : null,
      discountType,
      discountValue: valueNum,
      currency: showCurrency ? (currency.trim() ? currency.trim() : null) : null,
      endAt: noExpiry ? null : toIsoFromLocalInput(endAtLocal),
      status: active ? 'active' : 'paused',
    });

    if (didSave && mode === 'create') {
      setTitle('');
      setDescription('');
      setDiscountType('percent');
      setDiscountValue('');
      setCurrency('IQD');
      setEndAtLocal('');
      setNoExpiry(true);
      setActive(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-2">
          <Label htmlFor={`${mode}-title`}>Title</Label>
          <Input
            id={`${mode}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 20% off phone cases"
            className="h-9 rounded-lg bg-white/90 text-sm"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Deal type</Label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as SponsorServiceDiscountType)}
              className="h-9 w-full rounded-lg border border-input bg-white/90 px-3 text-sm shadow-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="percent">Percent off</option>
              <option value="amount">Amount off</option>
              <option value="freebie">Freebie</option>
              <option value="custom">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>{discountType === 'amount' ? 'Value' : discountType === 'percent' ? 'Percent' : 'Value'}</Label>
            <Input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              inputMode="decimal"
              placeholder={showValue ? (discountType === 'percent' ? '20' : '5000') : 'Not required'}
              disabled={!showValue}
              className="h-9 rounded-lg bg-white/90 text-sm disabled:opacity-65"
            />
          </div>
        </div>
      </div>

      <div className={cn('grid gap-2', showCurrency ? 'sm:grid-cols-2' : '')}>
        {showCurrency ? (
          <div className="space-y-2">
            <Label>Currency</Label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-white/90 px-3 text-sm shadow-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Ends (optional)</Label>
          <Input
            type="datetime-local"
            value={endAtLocal}
            onChange={(e) => setEndAtLocal(e.target.value)}
            disabled={noExpiry}
            className="h-9 rounded-lg bg-white/90 text-sm disabled:opacity-65"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 w-fit items-center gap-2 whitespace-nowrap rounded-lg border border-black/10 bg-white/70 px-2.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/50">
          <input
            type="checkbox"
            checked={noExpiry}
            onChange={(e) => setNoExpiry(e.target.checked)}
            className="h-4 w-4 rounded border-black/20"
          />
          No expiry
        </label>

        <div className="inline-flex h-9 w-fit items-center gap-2 whitespace-nowrap rounded-lg border border-black/10 bg-white/70 px-2.5 ring-1 ring-white/50">
          <div>
            <p className="text-xs font-semibold text-[#111827]">Active</p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} aria-label="Toggle active" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${mode}-desc`}>Description (optional)</Label>
        <Textarea
          id={`${mode}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short details. Keep it simple."
          className="min-h-[68px] rounded-lg bg-white/90 text-sm"
        />
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={submitting} className="h-8 rounded-md px-4 text-xs">
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
    </form>
  );
}

function EditServiceDialog({
  item,
  onUpdated,
  mode,
  storeId,
  includeStoreIdParam,
}: {
  item: SponsorServiceItem;
  onUpdated: (next: SponsorServiceItem) => void;
  mode: 'remote' | 'mock';
  storeId: string;
  includeStoreIdParam: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateService = async (
    payload: Parameters<typeof ServiceForm>[0]['onSubmit'] extends (p: infer P) => Promise<boolean> | boolean ? P : never,
  ) => {
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
      return true;
    }

    setSubmitting(true);
    try {
      const res = await fetch(withStoreId(`/api/sponsors/services/${encodeURIComponent(item.id)}`, storeId, includeStoreIdParam), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as UpdateResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: 'Failed to save', description: message ?? 'Please try again.', variant: 'destructive' });
        return false;
      }
      onUpdated(data.offer);
      setOpen(false);
      toast({ title: 'Saved' });
      return true;
    } catch (error) {
      console.error('Failed to update service', error);
      toast({ title: 'Failed to save', description: 'Please try again.', variant: 'destructive' });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-md bg-white/70 px-3 text-xs">
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
  endsLabelTemplate,
  canDeleteStore = false,
  isAdmin = false,
  mode = 'remote',
}: {
  store: StoreInfo;
  initialItems: SponsorServiceItem[];
  locale: Locale;
  sponsoredLabel: string;
  endsLabelTemplate: string;
  canDeleteStore?: boolean;
  isAdmin?: boolean;
  mode?: 'remote' | 'mock';
}) {
  const router = useRouter();
  const [items, setItems] = useState<SponsorServiceItem[]>(initialItems ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [storeCardUrl, setStoreCardUrl] = useState<string | null>(store.coverUrl?.trim() || null);
  const [storeCardAspectRatio, setStoreCardAspectRatio] = useState(DEFAULT_STORE_CARD_ASPECT_RATIO);
  const [storeCardBusy, setStoreCardBusy] = useState(false);
  const [storePhone, setStorePhone] = useState<string>(store.phone?.trim() || '');
  const [storeWhatsapp, setStoreWhatsapp] = useState<string>(store.whatsapp?.trim() || '');
  const [storeWebsite, setStoreWebsite] = useState<string>(store.website?.trim() || '');
  const [storeDirectionsUrl, setStoreDirectionsUrl] = useState<string>(store.directionsUrl?.trim() || '');
  const [storeContactBusy, setStoreContactBusy] = useState(false);
  const [storeDeleteBusy, setStoreDeleteBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const includeStoreIdParamForStore = true;
  const includeStoreIdParamForOffers = true;
  const formatEndsLabel = (time: string) =>
    endsLabelTemplate.includes('{time}') ? endsLabelTemplate.replace('{time}', time) : `${endsLabelTemplate} ${time}`;
  const maxOffersPerStore = isAdmin ? null : MAX_OFFERS_PER_STORE;
  const canCreateMoreOffers = maxOffersPerStore === null || items.length < maxOffersPerStore;
  const remainingOfferSlots = maxOffersPerStore === null ? null : Math.max(0, maxOffersPerStore - items.length);

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

  const applyStoreSnapshot = (nextStore: StoreSnapshot) => {
    setStoreCardUrl(nextStore.coverUrl ?? null);
    if (!nextStore.coverUrl) {
      setStoreCardAspectRatio(DEFAULT_STORE_CARD_ASPECT_RATIO);
    }
    setStorePhone(nextStore.phone ?? '');
    setStoreWhatsapp(nextStore.whatsapp ?? '');
    setStoreWebsite(nextStore.website ?? '');
    setStoreDirectionsUrl(nextStore.directionsUrl ?? '');
  };

  const patchStore = async (payload: StorePatchPayload, failureTitle: string): Promise<boolean> => {
    if (mode === 'mock') {
      if (Object.prototype.hasOwnProperty.call(payload, 'coverUrl')) {
        setStoreCardUrl(payload.coverUrl ?? null);
        if (!payload.coverUrl) {
          setStoreCardAspectRatio(DEFAULT_STORE_CARD_ASPECT_RATIO);
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
        setStorePhone(payload.phone ?? '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'whatsapp')) {
        setStoreWhatsapp(payload.whatsapp ?? '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'website')) {
        setStoreWebsite(payload.website ?? '');
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'directionsUrl')) {
        setStoreDirectionsUrl(payload.directionsUrl ?? '');
      }
      return true;
    }

    try {
      const res = await fetch(withStoreId('/api/sponsors/store', store.id, includeStoreIdParamForStore), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as UpdateStoreResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: failureTitle, description: message ?? 'Please try again.', variant: 'destructive' });
        return false;
      }
      applyStoreSnapshot(data.store);
      return true;
    } catch (error) {
      console.error('Failed to update sponsor store', error);
      toast({ title: failureTitle, description: 'Please try again.', variant: 'destructive' });
      return false;
    }
  };

  const updateStoreCardUrl = async (nextCoverUrl: string | null): Promise<boolean> => {
    setStoreCardBusy(true);
    try {
      return await patchStore({ coverUrl: nextCoverUrl }, 'Failed to update store card');
    } finally {
      setStoreCardBusy(false);
    }
  };

  const persistStoreContactLinks = async (): Promise<boolean> => {
    setStoreContactBusy(true);
    try {
      const ok = await patchStore(
        {
          phone: normalizeNullable(storePhone),
          whatsapp: normalizeNullable(storeWhatsapp),
          website: normalizeNullable(storeWebsite),
          directionsUrl: normalizeNullable(storeDirectionsUrl),
        },
        'Failed to update store details',
      );
      if (ok) {
        toast({ title: 'Store details updated' });
      }
      return ok;
    } finally {
      setStoreContactBusy(false);
    }
  };

  const saveStoreContactLinks = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await persistStoreContactLinks();
  };

  const deleteStore = async () => {
    if (!canDeleteStore) return;

    const confirmed = window.confirm(
      `Remove "${store.name}" store? This will permanently delete the store and all offers.`,
    );
    if (!confirmed) return;

    if (mode === 'mock') {
      toast({ title: 'Store removed (mock mode)' });
      return;
    }

    setStoreDeleteBusy(true);
    try {
      const res = await fetch(withStoreId('/api/sponsors/store', store.id, includeStoreIdParamForStore), { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as DeleteStoreResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: 'Failed to remove store', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Store removed' });
      router.push('/sponsors');
      router.refresh();
    } catch (error) {
      console.error('Failed to remove sponsor store', error);
      toast({ title: 'Failed to remove store', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setStoreDeleteBusy(false);
    }
  };

  const handleStoreCardChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_MIME_TYPES.has(file.type)) {
      toast({ title: 'Unsupported image format', description: 'Use JPG, PNG, WebP, or AVIF.', variant: 'destructive' });
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast({ title: 'Image is too large', description: 'Max file size is 50MB.', variant: 'destructive' });
      return;
    }

    setStoreCardBusy(true);
    try {
      const extension = resolveUploadExtension(file);
      if (!extension) {
        toast({ title: 'Store card upload failed', description: 'Unsupported image format.', variant: 'destructive' });
        return;
      }

      const signRes = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension, contentType: file.type || undefined, kind: 'product' }),
      });
      const signPayload = (await signRes.json().catch(() => ({}))) as {
        path?: string;
        token?: string;
        contentType?: string;
        error?: string;
      };
      const signedPath = typeof signPayload.path === 'string' ? signPayload.path.trim() : '';
      const signedToken = typeof signPayload.token === 'string' ? signPayload.token.trim() : '';

      if (!signRes.ok || !signedPath || !signedToken) {
        const message =
          typeof signPayload.error === 'string' && signPayload.error.trim().length > 0
            ? signPayload.error
            : 'Upload failed.';
        toast({ title: 'Store card upload failed', description: message, variant: 'destructive' });
        return;
      }

      const supabase = createSupabaseClient();
      const contentType =
        typeof signPayload.contentType === 'string' && signPayload.contentType.trim().length > 0
          ? signPayload.contentType
          : file.type || 'application/octet-stream';
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(signedPath, signedToken, file, {
          contentType,
          cacheControl: '31536000',
          upsert: false,
        });

      if (uploadError) {
        toast({ title: 'Store card upload failed', description: uploadError.message || 'Upload failed.', variant: 'destructive' });
        return;
      }

      const ok = await updateStoreCardUrl(signedPath);
      if (ok) {
        toast({ title: 'Store card updated' });
      }
    } catch (error) {
      console.error('Failed to upload store card image', error);
      toast({ title: 'Store card upload failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setStoreCardBusy(false);
    }
  };

  const handleStoreCardRemove = async () => {
    if (!storeCardUrl) return;
    const ok = await updateStoreCardUrl(null);
    if (ok) {
      setStoreCardAspectRatio(DEFAULT_STORE_CARD_ASPECT_RATIO);
      toast({ title: 'Store card removed' });
    }
  };

  const createService = async (
    payload: Parameters<typeof ServiceForm>[0]['onSubmit'] extends (p: infer P) => Promise<boolean> | boolean ? P : never,
  ) => {
    if (!canCreateMoreOffers) {
      toast({
        title: 'Offer limit reached',
        description: `You can create up to ${maxOffersPerStore ?? MAX_OFFERS_PER_STORE} offers per store.`,
        variant: 'destructive',
      });
      return false;
    }

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
        toast({ title: 'Offer added' });
        return true;
      } finally {
        setSubmitting(false);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(withStoreId('/api/sponsors/services', store.id, includeStoreIdParamForOffers), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as CreateResponse;
      if (!res.ok || !data.ok) {
        const message = typeof (data as any)?.error === 'string' ? (data as any).error : null;
        toast({ title: 'Failed to add offer', description: message ?? 'Please try again.', variant: 'destructive' });
        return false;
      }
      setItems((prev) => [data.offer, ...prev]);
      toast({ title: 'Offer added' });
      return true;
    } catch (error) {
      console.error('Failed to create service', error);
      toast({ title: 'Failed to add offer', description: 'Please try again.', variant: 'destructive' });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const deleteService = async (id: string) => {
    const ok = window.confirm('Delete this offer?');
    if (!ok) return;
    if (mode === 'mock') {
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast({ title: 'Deleted' });
      return;
    }
    try {
      const res = await fetch(withStoreId(`/api/sponsors/services/${encodeURIComponent(id)}`, store.id, includeStoreIdParamForOffers), {
        method: 'DELETE',
      });
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
      const res = await fetch(withStoreId(`/api/sponsors/services/${encodeURIComponent(item.id)}`, store.id, includeStoreIdParamForOffers), {
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

  const surfaceCardClass =
    'rounded-2xl border border-white/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(255,255,255,0.80))] shadow-[0_8px_24px_rgba(15,23,42,0.09)] ring-1 ring-white/40';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <Card className={surfaceCardClass}>
        <CardHeader className="gap-1.5 pb-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base text-brand">Store contacts & links</CardTitle>
            <p className="max-w-2xl text-xs text-muted-foreground md:text-sm">
              Set phone, WhatsApp, directions, and website links used on your store page.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={saveStoreContactLinks} className="space-y-2.5">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="store-phone">Phone number</Label>
                <Input
                  id="store-phone"
                  value={storePhone}
                  onChange={(event) => setStorePhone(event.target.value)}
                  placeholder="+964 7xx xxx xxxx"
                  className="h-9 rounded-lg bg-white/90 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-whatsapp">WhatsApp</Label>
                <Input
                  id="store-whatsapp"
                  value={storeWhatsapp}
                  onChange={(event) => setStoreWhatsapp(event.target.value)}
                  placeholder="+964 7xx xxx xxxx"
                  className="h-9 rounded-lg bg-white/90 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-directions-link">Directions link</Label>
                <Input
                  id="store-directions-link"
                  value={storeDirectionsUrl}
                  onChange={(event) => setStoreDirectionsUrl(event.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="h-9 rounded-lg bg-white/90 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-website-link">Website / social link</Label>
                <Input
                  id="store-website-link"
                  value={storeWebsite}
                  onChange={(event) => setStoreWebsite(event.target.value)}
                  placeholder="https://your-site.com or @handle"
                  className="h-9 rounded-lg bg-white/90 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {canDeleteStore ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-8 rounded-md px-3 text-xs"
                  disabled={storeDeleteBusy}
                  onClick={() => void deleteStore()}
                >
                  {storeDeleteBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Removing...
                    </span>
                  ) : (
                    'Remove store'
                  )}
                </Button>
              ) : (
                <span className="text-[10px] font-medium text-muted-foreground">
                  Contact details are visible on your public sponsor page.
                </span>
              )}

              <Button type="submit" className="h-8 rounded-md px-3 text-xs" disabled={storeContactBusy}>
                {storeContactBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </span>
                ) : (
                  'Save links'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className={surfaceCardClass}>
        <CardHeader className="gap-1.5 pb-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base text-brand">Store front card image</CardTitle>
            <p className="max-w-2xl text-xs text-muted-foreground md:text-sm">
              Upload the image shoppers see first on your sponsor store card.
            </p>
          </div>
          <span className="inline-flex rounded-full border border-black/10 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            16:9 recommended
          </span>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          <div className="mx-auto w-full max-w-3xl">
            <div className="relative overflow-hidden rounded-lg border border-dashed border-black/15 bg-white/80">
              <div className="relative w-full" style={{ aspectRatio: storeCardAspectRatio }}>
                {storeCardUrl ? (
                  <Image
                    src={storeCardUrl}
                    alt={`${store.name} store card`}
                    fill
                    sizes="(max-width: 768px) 100vw, 720px"
                    className="object-contain p-1.5"
                    onLoadingComplete={(img) => {
                      const nextAspect = normalizeStoreCardAspectRatio(img.naturalWidth, img.naturalHeight);
                      if (Math.abs(nextAspect - storeCardAspectRatio) > 0.01) {
                        setStoreCardAspectRatio(nextAspect);
                      }
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(120deg,#f8fafc,#e2e8f0)]">
                    <div className="text-center text-muted-foreground">
                      <ImagePlus className="mx-auto h-6 w-6" aria-hidden="true" />
                      <p className="mt-1.5 text-xs font-semibold">No card image yet</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="text-[10px] font-medium text-muted-foreground">
            Supported formats: JPG, PNG, WebP, AVIF. Maximum size: 50MB.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={handleStoreCardChange}
            />
            <Button
              type="button"
              className="h-8 rounded-md px-3 text-xs"
              disabled={storeCardBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {storeCardBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Uploading...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload card
                </span>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-md bg-white/80 px-3 text-xs"
              disabled={!storeCardUrl || storeCardBusy}
              onClick={() => void handleStoreCardRemove()}
            >
              <span className="inline-flex items-center gap-2">
                <X className="h-4 w-4" aria-hidden="true" />
                Remove
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={surfaceCardClass}>
        <CardHeader className="gap-1.5 pb-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base text-brand">Add an offer</CardTitle>
            <span className="inline-flex rounded-full border border-black/10 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {items.length}/{maxOffersPerStore ?? UNLIMITED_OFFERS_LABEL} offers
            </span>
          </div>
          <p className="text-xs text-muted-foreground md:text-sm">
            Keep each offer short and specific. Only active, unexpired offers show on your store page.
          </p>
          {canCreateMoreOffers ? (
            remainingOfferSlots === null ? (
              <p className="text-[11px] font-semibold text-muted-foreground">Admins can add unlimited offers.</p>
            ) : (
              <p className="text-[11px] font-semibold text-muted-foreground">
                You can add {remainingOfferSlots} more {remainingOfferSlots === 1 ? 'offer' : 'offers'}.
              </p>
            )
          ) : (
            <p className="text-[11px] font-semibold text-amber-700">Offer limit reached. Delete one to add another.</p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {canCreateMoreOffers ? (
            <ServiceForm mode="create" submitting={submitting} onSubmit={createService} />
          ) : (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3 text-xs font-semibold text-amber-800">
              Maximum {maxOffersPerStore ?? MAX_OFFERS_PER_STORE} offers per store.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={surfaceCardClass}>
        <CardHeader className="pb-1.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#111827] md:text-base">Your offers</h2>
              <p className="text-xs text-muted-foreground md:text-sm">Manage visibility and edit details anytime.</p>
            </div>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-black/10">
              {items.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {sorted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-white/75 p-3 text-xs text-muted-foreground ring-1 ring-white/40">
              No offers yet. Add your first offer above.
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((item) => {
                const offer = toOfferForCard(item, store.id);
                const endsIn =
                  item.endAt && !Number.isNaN(new Date(item.endAt).getTime())
                    ? formatDistanceToNow(new Date(item.endAt), { addSuffix: true })
                    : null;
                const active = isActiveStatus(item.status);

                return (
                  <div key={item.id} className="space-y-1.5">
                    <div className={cn('transition-opacity', !active ? 'opacity-70' : '')}>
                      <SponsorStoreServiceCard
                        offer={offer}
                        locale={locale}
                        sponsoredLabel={sponsoredLabel}
                        endsLabel={formatEndsLabel}
                        href={null}
                        className="w-full"
                        compact
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-white/80 px-2 py-1.5 text-[11px] ring-1 ring-white/50">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-extrabold ring-1',
                            active
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-slate-100 text-slate-600 ring-slate-200',
                          )}
                        >
                          {statusLabel(item.status)}
                        </span>
                        {endsIn ? (
                          <span className="font-medium text-muted-foreground" dir="auto">
                            Ends {endsIn}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2 py-0.5">
                          <span className="text-[10px] font-semibold text-muted-foreground">Visible</span>
                          <Switch
                            checked={active}
                            onCheckedChange={(checked) => void toggleActive(item, checked)}
                            aria-label="Toggle offer visibility"
                          />
                        </div>
                        <EditServiceDialog
                          item={item}
                          mode={mode}
                          storeId={store.id}
                          includeStoreIdParam={includeStoreIdParamForOffers}
                          onUpdated={(next) => setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)))}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-md bg-white/80 px-3 text-xs"
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          className="h-8 rounded-md px-4 text-xs"
          disabled={storeContactBusy}
          onClick={() => void persistStoreContactLinks()}
        >
          {storeContactBusy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving...
            </span>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  );
}
