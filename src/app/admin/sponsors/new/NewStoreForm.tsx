'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

type CreateStoreResponse =
  | { ok: true; store: { id: string; slug: string } }
  | { ok: false; error?: string }
  | { ok?: false; error?: string };

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function NewStoreForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const [slug, setSlug] = useState('');
  const effectiveSlug = slug.trim() ? slugify(slug) : suggestedSlug;

  const [primaryCity, setPrimaryCity] = useState<string>('erbil');
  const [status, setStatus] = useState<'pending' | 'active' | 'disabled'>('pending');
  const [tier, setTier] = useState<'basic' | 'featured'>('basic');
  const [isFeatured, setIsFeatured] = useState(false);

  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [website, setWebsite] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (name.trim().length < 2) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (effectiveSlug.length < 2) {
      toast({ title: 'Slug is required', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/sponsors/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: effectiveSlug,
          primaryCity: primaryCity === 'none' ? null : primaryCity,
          status,
          sponsorTier: tier,
          isFeatured,
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          website: website.trim() || null,
          ownerUserId: ownerUserId.trim() || null,
          logoUrl: logoUrl.trim() || null,
          coverUrl: coverUrl.trim() || null,
          description: description.trim() || null,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as CreateStoreResponse;
      if (!res.ok || !payload.ok) {
        const message = typeof (payload as any)?.error === 'string' ? (payload as any).error : undefined;
        toast({ title: 'Could not create store', description: message ?? 'Please try again.', variant: 'destructive' });
        return;
      }

      router.push(`/admin/sponsors/stores/${payload.store.id}`);
      router.refresh();
    } catch (error) {
      console.error('Failed to create sponsor store', error);
      toast({ title: 'Could not create store', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Store name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zain Phones" className="h-11 rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={suggestedSlug || 'e.g. zain-phones'}
            className="h-11 rounded-2xl font-semibold"
          />
          <p className="text-xs text-muted-foreground">Public URL: /sponsors/stores/{effectiveSlug || '…'}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>City</Label>
          <Select value={primaryCity} onValueChange={setPrimaryCity}>
            <SelectTrigger className="h-11 rounded-2xl">
              <SelectValue placeholder="Select a city" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="erbil">Erbil</SelectItem>
              <SelectItem value="sulaymaniyah">Sulaymaniyah</SelectItem>
              <SelectItem value="duhok">Duhok</SelectItem>
              <SelectItem value="zaxo">Zaxo</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="h-11 rounded-2xl">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="disabled">disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Sponsor tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as any)}>
            <SelectTrigger className="h-11 rounded-2xl">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">basic</SelectItem>
              <SelectItem value="featured">featured</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border bg-white/40 p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Featured store</p>
          <p className="text-xs text-muted-foreground">Shows in “Featured stores” section in Sponsors hub.</p>
        </div>
        <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+964…" className="h-11 rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input id="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+964…" className="h-11 rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className="h-11 rounded-2xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ownerUserId">Owner user id (optional)</Label>
        <Input
          id="ownerUserId"
          value={ownerUserId}
          onChange={(e) => setOwnerUserId(e.target.value)}
          placeholder="UUID (enables store reviews + product listings)"
          className="h-11 rounded-2xl"
        />
        <p className="text-xs text-muted-foreground">Optional: link this store to a KU BAZAR user account.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input id="logoUrl" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className="h-11 rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="coverUrl">Cover URL</Label>
          <Input id="coverUrl" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" className="h-11 rounded-2xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-28 rounded-2xl" />
      </div>

      <Button type="submit" disabled={submitting} className="h-11 rounded-2xl">
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Creating…
          </span>
        ) : (
          'Create store'
        )}
      </Button>
    </form>
  );
}
