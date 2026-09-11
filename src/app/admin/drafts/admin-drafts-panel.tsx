'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

type SellerMatch = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  name: string | null;
};

type DraftRow = {
  id: string;
  title: string | null;
  path: string;
  updatedAt: string | null;
  seller: SellerMatch | SellerMatch[] | null;
};

function sellerLabel(seller: SellerMatch | null | undefined): string {
  if (!seller) return '';
  return seller.full_name || seller.name || seller.email || seller.phone || seller.id;
}

function asSeller(value: DraftRow['seller']): SellerMatch | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function AdminDraftsPanel() {
  const { t } = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SellerMatch[]>([]);
  const [selected, setSelected] = useState<SellerMatch | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadDrafts = async () => {
      setLoadingDrafts(true);
      try {
        const response = await fetch('/api/admin/listing-drafts', { cache: 'no-store' });
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

  const lookupSeller = async () => {
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
      const response = await fetch(`/api/admin/listing-drafts/lookup?q=${encodeURIComponent(q)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Lookup failed');
      }
      const sellers = Array.isArray(data.sellers) ? data.sellers : [];
      setMatches(sellers);
      setSelected(sellers.length === 1 ? sellers[0] : null);
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
      setLookingUp(false);
    }
  };

  const createDraft = async () => {
    if (!selected?.id) {
      toast({
        title: t('collabDraft.chooseSellerTitle'),
        description: t('collabDraft.chooseSellerBody'),
        variant: 'destructive',
      });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/admin/listing-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: selected.id }),
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
        description: t('collabDraft.createFailedBody'),
        variant: 'destructive',
      });
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('collabDraft.adminHelp')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('collabDraft.lookupPlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void lookupSeller();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => void lookupSeller()} disabled={lookingUp}>
            {lookingUp ? t('collabDraft.lookingUp') : t('collabDraft.lookupAction')}
          </Button>
        </div>
        {matches.length > 0 ? (
          <ul className="space-y-2">
            {matches.map((seller) => {
              const selectedMatch = selected?.id === seller.id;
              return (
                <li key={seller.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(seller)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                      selectedMatch ? 'border-brand bg-brand/5' : 'border-black/10 bg-white'
                    }`}
                  >
                    <span className="font-semibold text-[#111827]">{sellerLabel(seller)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {[seller.email, seller.phone].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <Button type="button" onClick={() => void createDraft()} disabled={creating || !selected}>
          {creating ? t('collabDraft.creating') : t('collabDraft.createAction')}
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[#111827]">{t('collabDraft.openDraftsTitle')}</h2>
        {loadingDrafts ? (
          <p className="text-sm text-muted-foreground">{t('collabDraft.loadingDrafts')}</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('collabDraft.noDrafts')}</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((draft) => {
              const seller = asSeller(draft.seller);
              return (
                <li key={draft.id}>
                  <Link
                    href={draft.path}
                    className="block rounded-2xl border border-black/10 bg-white px-4 py-3 hover:bg-[#F9FAFB]"
                  >
                    <span className="font-semibold text-[#111827]">{draft.title || t('collabDraft.untitled')}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {sellerLabel(seller) || t('collabDraft.unknownSeller')}
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
