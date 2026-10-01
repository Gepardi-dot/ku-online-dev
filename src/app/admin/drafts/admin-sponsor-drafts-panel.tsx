'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

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
        <Button type="button" onClick={() => void createDraft()} disabled={creating || !selected?.owner?.id}>
          {creating ? t('collabDraft.creating') : t('collabDraft.createSponsorAction')}
        </Button>
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
