'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

const CITY_OPTIONS = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');

type OwnerMatch = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  name: string | null;
};

type StoreMatch = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  owner: OwnerMatch | null;
};

type DraftStore = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

type DraftRow = {
  id: string;
  title: string | null;
  path: string;
  seller: OwnerMatch | OwnerMatch[] | null;
  store: DraftStore | DraftStore[] | null;
};

function personLabel(person: OwnerMatch | null | undefined): string {
  if (!person) return '';
  return person.full_name || person.name || person.email || person.phone || '';
}

function asOne<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function latinSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function storeSlugFor(name: string): string | undefined {
  if (latinSlug(name).length >= 2) return undefined;
  return `store-${Date.now().toString(36)}`.slice(0, 80);
}

export default function AdminSponsorDraftsPanel() {
  const { t } = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<StoreMatch[]>([]);
  const [selected, setSelected] = useState<StoreMatch | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [storeFormOpen, setStoreFormOpen] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeCity, setStoreCity] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [ownerQuery, setOwnerQuery] = useState('');
  const [ownerMatches, setOwnerMatches] = useState<OwnerMatch[]>([]);
  const [owner, setOwner] = useState<OwnerMatch | null>(null);
  const [findingOwner, setFindingOwner] = useState(false);
  const [savingStore, setSavingStore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadDrafts = async () => {
      setLoadingDrafts(true);
      try {
        const response = await fetch('/api/admin/sponsor-product-drafts', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Failed to load drafts');
        }
        if (!cancelled) {
          setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast({
            title: t('collabDraft.adminLoadFailedTitle'),
            description: t('collabDraft.adminLoadFailedBody'),
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingDrafts(false);
        }
      }
    };
    void loadDrafts();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const lookupStore = async () => {
    const q = query.trim();
    if (q.length < 3) {
      toast({
        title: t('collabDraft.lookupTooShortTitle'),
        description: t('collabDraft.lookupTooShortBody'),
        variant: 'destructive',
      });
      return;
    }
    setLookingUp(true);
    try {
      const response = await fetch(`/api/admin/sponsor-product-drafts/lookup?q=${encodeURIComponent(q)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Lookup failed');
      }
      const stores = Array.isArray(data.stores) ? data.stores : [];
      setMatches(stores);
      setSelected(stores.length === 1 ? stores[0] : null);
      if (stores.length === 0) {
        if (!q.includes('@')) {
          setStoreName(q);
        }
        setStoreFormOpen(true);
        toast({
          title: t('collabDraft.sponsorNotFoundTitle'),
          description: t('collabDraft.sponsorNotFoundBody'),
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: t('collabDraft.lookupFailedTitle'),
        description: t('collabDraft.lookupFailedBody'),
        variant: 'destructive',
      });
    } finally {
      setLookingUp(false);
    }
  };

  const createDraft = async () => {
    if (!selected?.id) {
      toast({
        title: t('collabDraft.chooseStoreTitle'),
        description: t('collabDraft.chooseStoreBody'),
        variant: 'destructive',
      });
      return;
    }
    if (!selected.owner?.id) {
      toast({
        title: t('collabDraft.chooseStoreTitle'),
        description: t('collabDraft.missingOwner'),
        variant: 'destructive',
      });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/admin/sponsor-product-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: selected.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.path) {
        throw new Error(data?.error || 'Create failed');
      }
      router.push(data.path);
    } catch (error) {
      console.error(error);
      toast({
        title: t('collabDraft.createFailedTitle'),
        description: error instanceof Error ? error.message : t('collabDraft.createFailedBody'),
        variant: 'destructive',
      });
      setCreating(false);
    }
  };

  const openStoreForm = () => {
    const typed = query.trim();
    if (!storeName.trim() && typed && !typed.includes('@')) {
      setStoreName(typed);
    }
    setStoreFormOpen(true);
  };

  const findOwner = async () => {
    const q = ownerQuery.trim();
    if (q.length < 3) {
      toast({
        title: t('collabDraft.lookupTooShortTitle'),
        description: t('collabDraft.lookupTooShortBody'),
        variant: 'destructive',
      });
      return;
    }
    setFindingOwner(true);
    try {
      const response = await fetch(`/api/admin/listing-drafts/lookup?q=${encodeURIComponent(q)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Lookup failed');
      }
      const sellers = Array.isArray(data.sellers) ? (data.sellers as OwnerMatch[]) : [];
      setOwnerMatches(sellers);
      setOwner(sellers.length === 1 ? sellers[0] : null);
      if (sellers.length === 0) {
        toast({
          title: t('collabDraft.sellerNotFoundTitle'),
          description: t('collabDraft.sellerNotFoundBody'),
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: t('collabDraft.lookupFailedTitle'),
        description: t('collabDraft.lookupFailedBody'),
        variant: 'destructive',
      });
    } finally {
      setFindingOwner(false);
    }
  };

  const saveStore = async () => {
    const name = storeName.trim();
    if (name.length < 2) {
      toast({
        title: t('collabDraft.createStoreAction'),
        description: t('collabDraft.storeNameRequired'),
        variant: 'destructive',
      });
      return;
    }
    if (!owner?.id) {
      toast({
        title: t('collabDraft.createStoreAction'),
        description: t('collabDraft.ownerRequired'),
        variant: 'destructive',
      });
      return;
    }
    setSavingStore(true);
    try {
      const response = await fetch('/api/admin/sponsors/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: storeSlugFor(name),
          primaryCity: storeCity || null,
          phone: storePhone.trim() || null,
          whatsapp: storePhone.trim() || null,
          ownerUserId: owner.id,
          status: 'active',
          sponsorTier: 'basic',
          isFeatured: false,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.store?.id) {
        throw new Error(data?.error || 'Create failed');
      }
      const created: StoreMatch = {
        id: data.store.id,
        name: data.store.name ?? name,
        slug: data.store.slug ?? null,
        status: data.store.status ?? 'active',
        city: storeCity || null,
        phone: data.store.phone ?? (storePhone.trim() || null),
        whatsapp: data.store.whatsapp ?? (storePhone.trim() || null),
        website: data.store.website ?? null,
        owner,
      };
      setMatches((current) => [created, ...current.filter((store) => store.id !== created.id)]);
      setSelected(created);
      setStoreFormOpen(false);
      toast({
        title: t('collabDraft.storeCreatedTitle'),
        description: t('collabDraft.storeCreatedBody'),
      });
    } catch (error) {
      console.error(error);
      toast({
        title: t('collabDraft.createFailedTitle'),
        description: error instanceof Error ? error.message : t('collabDraft.createFailedBody'),
        variant: 'destructive',
      });
    } finally {
      setSavingStore(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('collabDraft.sponsorHelp')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('collabDraft.sponsorLookupPlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void lookupStore();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => void lookupStore()} disabled={lookingUp}>
            {lookingUp ? t('collabDraft.lookingUp') : t('collabDraft.sponsorLookupAction')}
          </Button>
        </div>
        {matches.length > 0 ? (
          <ul className="space-y-2">
            {matches.map((store) => {
              const selectedMatch = selected?.id === store.id;
              const ownerName = personLabel(store.owner);
              const contact = [store.owner?.email, store.phone || store.whatsapp || store.owner?.phone]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={store.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(store)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                      selectedMatch ? 'border-brand bg-brand/5' : 'border-black/10 bg-white'
                    }`}
                  >
                    <span className="font-semibold text-[#111827]">{store.name || store.slug}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {[store.status, store.city, ownerName || t('collabDraft.missingOwner')].filter(Boolean).join(' · ')}
                    </span>
                    {contact ? <span className="mt-1 block text-xs text-muted-foreground">{contact}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              if (selected?.owner?.id) {
                void createDraft();
                return;
              }
              openStoreForm();
            }}
            disabled={creating || savingStore}
          >
            {creating
              ? t('collabDraft.creating')
              : selected?.owner?.id
                ? t('collabDraft.createSponsorAction')
                : t('collabDraft.createStoreAction')}
          </Button>
          {selected?.owner?.id ? (
            <Button type="button" variant="outline" onClick={openStoreForm}>
              {t('collabDraft.createStoreAction')}
            </Button>
          ) : null}
        </div>
        {!selected ? (
          <p className="text-xs text-muted-foreground">{t('collabDraft.createStoreHint')}</p>
        ) : !selected.owner?.id ? (
          <p className="text-xs text-muted-foreground">{t('collabDraft.missingOwner')}</p>
        ) : null}
        {storeFormOpen ? (
          <div className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-sm text-muted-foreground">{t('collabDraft.createStoreHelp')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sponsor-store-name">{t('collabDraft.storeNameLabel')}</Label>
                <Input
                  id="sponsor-store-name"
                  value={storeName}
                  onChange={(event) => setStoreName(event.target.value)}
                  placeholder={t('collabDraft.storeNamePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('collabDraft.storeCityLabel')}</Label>
                <Select value={storeCity || undefined} onValueChange={setStoreCity}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('collabDraft.storeCityLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sponsor-store-phone">{t('collabDraft.storePhoneLabel')}</Label>
                <Input
                  id="sponsor-store-phone"
                  value={storePhone}
                  onChange={(event) => setStorePhone(event.target.value)}
                  placeholder="+964 750 000 0000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sponsor-store-owner">{t('collabDraft.ownerLookupLabel')}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="sponsor-store-owner"
                  value={ownerQuery}
                  onChange={(event) => setOwnerQuery(event.target.value)}
                  placeholder={t('collabDraft.lookupPlaceholder')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void findOwner();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={() => void findOwner()} disabled={findingOwner}>
                  {findingOwner ? t('collabDraft.lookingUp') : t('collabDraft.lookupAction')}
                </Button>
              </div>
              {ownerMatches.length > 0 ? (
                <ul className="space-y-2">
                  {ownerMatches.map((person) => {
                    const selectedOwner = owner?.id === person.id;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => setOwner(person)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                            selectedOwner ? 'border-brand bg-brand/5' : 'border-black/10 bg-white'
                          }`}
                        >
                          <span className="font-semibold text-[#111827]">{personLabel(person) || person.id}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {[person.email, person.phone].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <Button type="button" onClick={() => void saveStore()} disabled={savingStore}>
              {savingStore ? t('collabDraft.creating') : t('collabDraft.saveStoreAction')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[#111827]">{t('collabDraft.openSponsorDraftsTitle')}</h2>
        {loadingDrafts ? (
          <p className="text-sm text-muted-foreground">{t('collabDraft.loadingDrafts')}</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('collabDraft.noSponsorDrafts')}</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((draft) => {
              const store = asOne(draft.store);
              const seller = asOne(draft.seller);
              return (
                <li key={draft.id}>
                  <Link
                    href={draft.path}
                    className="block rounded-2xl border border-black/10 bg-white px-4 py-3 hover:bg-[#F9FAFB]"
                  >
                    <span className="font-semibold text-[#111827]">{draft.title || t('collabDraft.untitled')}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {[store?.name, personLabel(seller) || t('collabDraft.unknownSeller')].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
