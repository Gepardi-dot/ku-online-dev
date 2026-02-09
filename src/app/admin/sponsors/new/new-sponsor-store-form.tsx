'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

const CITY_OPTIONS = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');

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

export default function NewSponsorStoreForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [primaryCity, setPrimaryCity] = useState<string>('none');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [status, setStatus] = useState<'pending' | 'active' | 'disabled'>('active');
  const [sponsorTier, setSponsorTier] = useState<'basic' | 'featured'>('basic');
  const [isFeatured, setIsFeatured] = useState(false);

  const normalizedName = name.trim();
  const resolvedSlug = useMemo(() => {
    const source = slug.trim() || normalizedName;
    return slugify(source);
  }, [slug, normalizedName]);
  const canSubmit = normalizedName.length >= 2 && resolvedSlug.length >= 2 && !submitting;

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

      toast({ title: 'Store created', description: `${data.store.name} is ready.` });
      router.push(`/sponsors/stores/${data.store.slug}`);
      router.refresh();
    } catch (error) {
      console.error('Failed to create store', error);
      toast({ title: 'Create store failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
  );
}
