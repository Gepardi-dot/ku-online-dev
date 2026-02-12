'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { SponsorServicesManager } from '@/components/sponsors/SponsorServicesManager';
import { MARKET_CITY_OPTIONS, normalizeMarketCityValue } from '@/data/market-cities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import type { Locale } from '@/lib/locale/dictionary';

const CITY_OPTIONS = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');

type NewSponsorStoreFormProps = {
  initialName?: string;
  initialOwnerUserId?: string;
  initialPrimaryCity?: string;
  initialPhone?: string;
  initialWebsite?: string;
  initialWhatsapp?: string;
  locale: Locale;
  sponsoredLabel: string;
  endsLabelTemplate: string;
};

type CreateStoreResponse =
  | {
      ok: true;
      store: {
        id: string;
        name: string;
        slug: string;
        status: 'pending' | 'active' | 'disabled';
      };
    }
  | { ok: false; error?: string };

type CreatedStoreSnapshot = {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'active' | 'disabled';
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
};

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function resolveInitialCity(value: string | undefined): string {
  const normalized = normalizeMarketCityValue(value);
  const isSupported = CITY_OPTIONS.some((city) => city.value === normalized);
  return isSupported ? normalized : 'none';
}

function normalizeNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export default function NewSponsorStoreForm({
  initialName = '',
  initialOwnerUserId = '',
  initialPrimaryCity = '',
  initialPhone = '',
  initialWebsite = '',
  initialWhatsapp = '',
  locale,
  sponsoredLabel,
  endsLabelTemplate,
}: NewSponsorStoreFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(() => initialName.trim());
  const [slug, setSlug] = useState(() => slugify(initialName.trim()));
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [primaryCity, setPrimaryCity] = useState<string>(() => resolveInitialCity(initialPrimaryCity));
  const [ownerUserId, setOwnerUserId] = useState(() => initialOwnerUserId.trim());
  const [phone, setPhone] = useState(() => initialPhone.trim());
  const [website, setWebsite] = useState(() => initialWebsite.trim());
  const [whatsapp, setWhatsapp] = useState(() => initialWhatsapp.trim());
  const [status, setStatus] = useState<'pending' | 'active' | 'disabled'>('active');
  const [sponsorTier, setSponsorTier] = useState<'basic' | 'featured'>('basic');
  const [isFeatured, setIsFeatured] = useState(false);
  const [createdStore, setCreatedStore] = useState<CreatedStoreSnapshot | null>(null);

  const normalizedName = name.trim();
  const resolvedSlug = useMemo(() => {
    const source = slug.trim() || normalizedName;
    return slugify(source);
  }, [slug, normalizedName]);
  const canSubmit = normalizedName.length >= 2 && resolvedSlug.length >= 2 && !submitting && !createdStore;

  const resetForAnotherStore = () => {
    setCreatedStore(null);
    setName('');
    setSlug('');
    setSlugTouched(false);
    setDescription('');
    setPrimaryCity('none');
    setOwnerUserId('');
    setPhone('');
    setWebsite('');
    setWhatsapp('');
    setStatus('active');
    setSponsorTier('basic');
    setIsFeatured(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const payload = {
        name: normalizedName,
        slug: slug.trim() || null,
        description: description.trim() || null,
        primaryCity: primaryCity === 'none' ? null : primaryCity,
        ownerUserId: ownerUserId.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        whatsapp: whatsapp.trim() || null,
        status,
        sponsorTier,
        isFeatured,
      };

      const response = await fetch('/api/admin/sponsors/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({ ok: false }))) as CreateStoreResponse;

      if (!response.ok || data.ok !== true) {
        const message =
          'error' in data && typeof data.error === 'string' ? data.error : 'Could not create store.';
        toast({ title: 'Create store failed', description: message, variant: 'destructive' });
        return;
      }

      setCreatedStore({
        id: data.store.id,
        name: data.store.name,
        slug: data.store.slug,
        status: data.store.status,
        phone: normalizeNullable(phone),
        website: normalizeNullable(website),
        whatsapp: normalizeNullable(whatsapp),
      });
      toast({
        title: 'Store created',
        description: 'Now finish setup below: links, card image, and offers.',
      });
      setTimeout(() => {
        document.getElementById('store-setup-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 10);
    } catch (error) {
      console.error('Failed to create store', error);
      toast({ title: 'Create store failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!createdStore ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store name</Label>
              <Input
                id="store-name"
                value={name}
                onChange={(event) => {
                  const next = event.target.value;
                  setName(next);
                  if (!slugTouched) {
                    setSlug(slugify(next));
                  }
                }}
                placeholder="e.g. Demo Seller"
                className="h-11 rounded-xl bg-white/85"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-slug">Slug</Label>
              <Input
                id="store-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="demo-seller"
                className="h-11 rounded-xl bg-white/85"
              />
              <p className="text-xs text-muted-foreground">Will be saved as: {resolvedSlug || '-'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-description">Description (optional)</Label>
            <Textarea
              id="store-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short intro about the store."
              className="min-h-[96px] rounded-xl bg-white/85"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Primary city</Label>
              <Select value={primaryCity} onValueChange={setPrimaryCity}>
                <SelectTrigger className="h-11 rounded-xl bg-white/85">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {CITY_OPTIONS.map((city) => (
                    <SelectItem key={city.value} value={city.value}>
                      {city.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-user-id">Owner user ID (optional)</Label>
              <Input
                id="owner-user-id"
                value={ownerUserId}
                onChange={(event) => setOwnerUserId(event.target.value)}
                placeholder="UUID"
                className="h-11 rounded-xl bg-white/85"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="store-phone">Phone (optional)</Label>
              <Input
                id="store-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+964 7xx xxx xxxx"
                className="h-11 rounded-xl bg-white/85"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-whatsapp">WhatsApp (optional)</Label>
              <Input
                id="store-whatsapp"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="+964 7xx xxx xxxx"
                className="h-11 rounded-xl bg-white/85"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-website">Website / social (optional)</Label>
              <Input
                id="store-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.com or @handle"
                className="h-11 rounded-xl bg-white/85"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger className="h-11 rounded-xl bg-white/85">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sponsor tier</Label>
              <Select value={sponsorTier} onValueChange={(value) => setSponsorTier(value as typeof sponsorTier)}>
                <SelectTrigger className="h-11 rounded-xl bg-white/85">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="featured">Featured</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white/65 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#111827]">Featured flag</p>
              <p className="text-xs text-muted-foreground">Highlights the store in ranking logic.</p>
            </div>
            <Switch checked={isFeatured} onCheckedChange={setIsFeatured} aria-label="Featured flag" />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => router.push('/sponsors')}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={!canSubmit}>
              {submitting ? 'Creating...' : 'Create store'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900">Store created: {createdStore.name}</p>
              <p className="mt-1 text-xs text-emerald-800/90">
                Continue setup below on this page. No page switching is required.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/sponsors/stores/${createdStore.slug}`}
                className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-50"
              >
                View public store
              </Link>
              <Link
                href={`/sponsors/manage?store=${encodeURIComponent(createdStore.slug)}`}
                className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-50"
              >
                Open manage workspace
              </Link>
              <Button type="button" variant="outline" className="rounded-full" onClick={resetForAnotherStore}>
                Create another store
              </Button>
            </div>
          </div>
        </div>
      )}

      {createdStore ? (
        <section id="store-setup-workspace" className="space-y-3">
          <div className="rounded-xl border border-black/10 bg-white/70 p-3">
            <p className="text-sm font-semibold text-[#111827]">Complete setup workspace</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Finish this store in one place: links, front card image, and offers.
            </p>
          </div>

          <SponsorServicesManager
            store={{
              id: createdStore.id,
              name: createdStore.name,
              slug: createdStore.slug,
              coverUrl: null,
              phone: createdStore.phone,
              whatsapp: createdStore.whatsapp,
              website: createdStore.website,
              directionsUrl: null,
            }}
            initialItems={[]}
            locale={locale}
            sponsoredLabel={sponsoredLabel}
            endsLabelTemplate={endsLabelTemplate}
            canDeleteStore
            isAdmin
          />
        </section>
      ) : null}
    </div>
  );
}
