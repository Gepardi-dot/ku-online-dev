'use client';

import Link from 'next/link';
import { type ReactNode, FormEvent, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { BadgeCheck, CircleDashed, ExternalLink, Mail, MessageSquareText, Phone } from 'lucide-react';

import { SponsorStoreSetupSections, type SponsorStoreSetupSummary } from '@/components/sponsors/SponsorStoreSetupSections';
import { MARKET_CITY_OPTIONS, normalizeMarketCityValue } from '@/data/market-cities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import type { Locale } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';

const CITY_OPTIONS = MARKET_CITY_OPTIONS.filter((option) => option.value !== 'all');

export type CreateStoreApplicationContext = {
  id: string;
  userId: string | null;
  name: string;
  company: string | null;
  email: string;
  website: string | null;
  message: string;
  city: string | null;
  phone: string | null;
  status: 'new' | 'reviewed' | 'closed';
  createdAt: string | null;
};

type NewSponsorStoreFormProps = {
  initialName?: string;
  initialDescription?: string;
  initialOwnerUserId?: string;
  initialPrimaryCity?: string;
  initialPhone?: string;
  initialWebsite?: string;
  initialWhatsapp?: string;
  locale: Locale;
  sponsoredLabel: string;
  endsLabelTemplate: string;
  application?: CreateStoreApplicationContext | null;
};

type CreateStoreResponse =
  | {
      ok: true;
      store: {
        id: string;
        name: string;
        slug: string;
        status: 'pending' | 'active' | 'disabled';
        phone: string | null;
        whatsapp: string | null;
        website: string | null;
      };
    }
  | {
      ok: false;
      error?: string;
      errorCode?: string;
      existingStore?: {
        id: string;
        name: string;
        slug: string;
        status: 'pending' | 'active' | 'disabled';
        phone: string | null;
        whatsapp: string | null;
        website: string | null;
      };
    };

type InquiryStatusResponse =
  | { ok: true; inquiry: { id: string; status: 'new' | 'reviewed' | 'closed' } }
  | { ok: false; error?: string };

type StoreWorkspaceResponse =
  | {
      ok: true;
      store: {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        primaryCity: string | null;
        status: string;
        sponsorTier: string;
        isFeatured: boolean;
        ownerUserId: string | null;
        coverUrl: string | null;
        phone: string | null;
        whatsapp: string | null;
        website: string | null;
        directionsUrl: string | null;
      };
    }
  | { ok: false; error?: string };

type WorkspaceStoreSnapshot = {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'active' | 'disabled';
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
};

type WorkspaceStoreDetails = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  primaryCity: string | null;
  status: string;
  sponsorTier: string;
  isFeatured: boolean;
  ownerUserId: string | null;
  coverUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  directionsUrl: string | null;
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

function toWebsiteHref(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('@')) return `https://instagram.com/${encodeURIComponent(normalized.slice(1))}`;
  return `https://${normalized}`;
}

function toTelHref(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/[^\d+]/g, '').trim();
  return normalized ? `tel:${normalized}` : null;
}

function toWhatsAppHref(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+').trim();
  if (!normalized) return null;
  const number = normalized.startsWith('+') ? normalized.slice(1) : normalized;
  return number ? `https://wa.me/${encodeURIComponent(number)}` : null;
}

function statusChipClass(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'reviewed' || normalized === 'active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'closed' || normalized === 'disabled') {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function buildInitialState(input: {
  name: string;
  description: string;
  ownerUserId: string;
  primaryCity: string;
  phone: string;
  website: string;
  whatsapp: string;
  hasApplication: boolean;
}) {
  const normalizedName = input.name.trim();
  return {
    name: normalizedName,
    slug: slugify(normalizedName),
    description: input.description.trim(),
    primaryCity: resolveInitialCity(input.primaryCity),
    ownerUserId: input.ownerUserId.trim(),
    phone: input.phone.trim(),
    website: input.website.trim(),
    whatsapp: input.whatsapp.trim(),
    status: (input.hasApplication ? 'pending' : 'active') as 'pending' | 'active' | 'disabled',
    sponsorTier: 'basic' as 'basic' | 'featured',
    isFeatured: false,
  };
}

function WorkspaceSection({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(255,255,255,0.82))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/40 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#111827]">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LockedWorkspaceCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <WorkspaceSection
      title={title}
      description={description}
      aside={
        <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/85 px-3 py-1 text-xs font-semibold text-muted-foreground">
          <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
          Unlocks after store creation
        </span>
      }
    >
      <div className="rounded-2xl border border-dashed border-black/15 bg-white/75 p-5 text-sm text-muted-foreground">
        Create the store first, then this section becomes active in the same page.
      </div>
    </WorkspaceSection>
  );
}

export default function NewSponsorStoreForm({
  initialName = '',
  initialDescription = '',
  initialOwnerUserId = '',
  initialPrimaryCity = '',
  initialPhone = '',
  initialWebsite = '',
  initialWhatsapp = '',
  locale,
  sponsoredLabel,
  endsLabelTemplate,
  application = null,
}: NewSponsorStoreFormProps) {
  const initialDraft = useMemo(
    () =>
      buildInitialState({
        name: initialName,
        description: initialDescription,
        ownerUserId: initialOwnerUserId,
        primaryCity: initialPrimaryCity,
        phone: initialPhone,
        website: initialWebsite,
        whatsapp: initialWhatsapp,
        hasApplication: Boolean(application),
      }),
    [
      application,
      initialDescription,
      initialName,
      initialOwnerUserId,
      initialPhone,
      initialPrimaryCity,
      initialWebsite,
      initialWhatsapp,
    ],
  );

  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(() => initialDraft.name);
  const [slug, setSlug] = useState(() => initialDraft.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(() => initialDraft.description);
  const [primaryCity, setPrimaryCity] = useState<string>(() => initialDraft.primaryCity);
  const [ownerUserId, setOwnerUserId] = useState(() => initialDraft.ownerUserId);
  const [phone, setPhone] = useState(() => initialDraft.phone);
  const [website, setWebsite] = useState(() => initialDraft.website);
  const [whatsapp, setWhatsapp] = useState(() => initialDraft.whatsapp);
  const [status, setStatus] = useState<'pending' | 'active' | 'disabled'>(() => initialDraft.status);
  const [sponsorTier, setSponsorTier] = useState<'basic' | 'featured'>(() => initialDraft.sponsorTier);
  const [isFeatured, setIsFeatured] = useState(() => initialDraft.isFeatured);
  const [applicationState, setApplicationState] = useState<CreateStoreApplicationContext | null>(application);
  const [workspaceStore, setWorkspaceStore] = useState<WorkspaceStoreSnapshot | null>(null);
  const [workspaceSource, setWorkspaceSource] = useState<'created' | 'existing' | null>(null);
  const [workspaceDetails, setWorkspaceDetails] = useState<WorkspaceStoreDetails | null>(null);
  const [workspaceSummary, setWorkspaceSummary] = useState<SponsorStoreSetupSummary>({
    offerCount: 0,
    hasCardImage: false,
    hasContacts: false,
  });
  const [storeDetailsLoading, setStoreDetailsLoading] = useState(false);
  const [updatingInquiryStatus, setUpdatingInquiryStatus] = useState(false);

  useEffect(() => {
    if (!workspaceStore?.id) {
      setWorkspaceDetails(null);
      setStoreDetailsLoading(false);
      return;
    }

    let active = true;
    setStoreDetailsLoading(true);

    const loadStore = async () => {
      try {
        const res = await fetch(`/api/sponsors/store?storeId=${encodeURIComponent(workspaceStore.id)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as StoreWorkspaceResponse;
        if (!active) return;
        if (res.ok && data.ok) {
          setWorkspaceDetails(data.store);
        }
      } catch (error) {
        if (active) {
          console.error('Failed to hydrate create-store workspace', error);
        }
      } finally {
        if (active) {
          setStoreDetailsLoading(false);
        }
      }
    };

    void loadStore();

    return () => {
      active = false;
    };
  }, [workspaceStore?.id]);

  const normalizedName = name.trim();
  const resolvedSlug = useMemo(() => {
    const source = slug.trim() || normalizedName;
    return slugify(source);
  }, [slug, normalizedName]);
  const canSubmit = normalizedName.length >= 2 && resolvedSlug.length >= 2 && !submitting && !workspaceStore;

  const applicantMailHref = applicationState?.email ? `mailto:${encodeURIComponent(applicationState.email)}` : null;
  const applicantPhoneHref = toTelHref(applicationState?.phone);
  const applicantWebsiteHref = toWebsiteHref(applicationState?.website);
  const applicantWhatsappHref = toWhatsAppHref(applicationState?.phone);
  const applicationCreatedLabel =
    applicationState?.createdAt && !Number.isNaN(new Date(applicationState.createdAt).getTime())
      ? formatDistanceToNow(new Date(applicationState.createdAt), { addSuffix: true })
      : null;

  const effectiveStore =
    workspaceDetails ??
    (workspaceStore
      ? {
          id: workspaceStore.id,
          name: workspaceStore.name,
          slug: workspaceStore.slug,
          description: description.trim() || null,
          primaryCity: primaryCity === 'none' ? null : primaryCity,
          status: workspaceStore.status,
          sponsorTier,
          isFeatured,
          ownerUserId: ownerUserId.trim() || null,
          coverUrl: null,
          phone: workspaceStore.phone,
          whatsapp: workspaceStore.whatsapp,
          website: workspaceStore.website,
          directionsUrl: null,
        }
      : null);

  const effectiveSummary: SponsorStoreSetupSummary = {
    offerCount: workspaceSummary.offerCount,
    hasCardImage: workspaceSummary.hasCardImage || Boolean(effectiveStore?.coverUrl),
    hasContacts:
      workspaceSummary.hasContacts ||
      Boolean(effectiveStore?.phone || effectiveStore?.whatsapp || effectiveStore?.website || effectiveStore?.directionsUrl),
  };

  const publicStoreHref = effectiveStore ? `/sponsors/stores/${encodeURIComponent(effectiveStore.slug)}` : null;
  const toggleInquiryStatusLabel =
    applicationState?.status === 'reviewed' || applicationState?.status === 'closed' ? 'Reopen' : 'Mark reviewed';

  const resetForAnotherStore = () => {
    setWorkspaceStore(null);
    setWorkspaceSource(null);
    setWorkspaceDetails(null);
    setWorkspaceSummary({ offerCount: 0, hasCardImage: false, hasContacts: false });
    setName(initialDraft.name);
    setSlug(initialDraft.slug);
    setSlugTouched(false);
    setDescription(initialDraft.description);
    setPrimaryCity(initialDraft.primaryCity);
    setOwnerUserId(initialDraft.ownerUserId);
    setPhone(initialDraft.phone);
    setWebsite(initialDraft.website);
    setWhatsapp(initialDraft.whatsapp);
    setStatus(initialDraft.status);
    setSponsorTier(initialDraft.sponsorTier);
    setIsFeatured(initialDraft.isFeatured);
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
        const conflictStore = 'existingStore' in data && data.existingStore ? data.existingStore : null;
        if ('errorCode' in data && data.errorCode === 'SPONSOR_SLUG_CONFLICT' && conflictStore) {
          setWorkspaceDetails(null);
          setWorkspaceSummary({ offerCount: 0, hasCardImage: false, hasContacts: false });
          setWorkspaceStore(conflictStore);
          setWorkspaceSource('existing');
          setName(conflictStore.name);
          setSlug(conflictStore.slug);
          setSlugTouched(true);
          setPhone(conflictStore.phone ?? '');
          setWebsite(conflictStore.website ?? '');
          setWhatsapp(conflictStore.whatsapp ?? '');
          setStatus(conflictStore.status);
          toast({
            title: 'Existing store loaded',
            description: 'That slug already exists. Continue the setup below in the same workspace.',
          });
          return;
        }

        const message = 'error' in data && typeof data.error === 'string' ? data.error : 'Could not create store.';
        toast({ title: 'Create store failed', description: message, variant: 'destructive' });
        return;
      }

      setWorkspaceDetails(null);
      setWorkspaceSummary({ offerCount: 0, hasCardImage: false, hasContacts: false });
      setWorkspaceStore(data.store);
      setWorkspaceSource('created');
      toast({
        title: 'Store created',
        description: 'Continue with contacts, card image, and offers below.',
      });
    } catch (error) {
      console.error('Failed to create store', error);
      toast({ title: 'Create store failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const updateInquiryStatus = async () => {
    if (!applicationState?.id || updatingInquiryStatus) return;
    const nextStatus = applicationState.status === 'new' ? 'reviewed' : 'new';
    setUpdatingInquiryStatus(true);
    try {
      const res = await fetch(`/api/admin/partnerships/${encodeURIComponent(applicationState.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json().catch(() => ({}))) as InquiryStatusResponse;
      if (!res.ok || !data.ok) {
        const message = 'error' in data && typeof data.error === 'string' ? data.error : 'Failed to update application status.';
        toast({ title: 'Application update failed', description: message, variant: 'destructive' });
        return;
      }
      setApplicationState((prev) => (prev ? { ...prev, status: data.inquiry.status } : prev));
      toast({ title: data.inquiry.status === 'reviewed' ? 'Application reviewed' : 'Application reopened' });
    } catch (error) {
      console.error('Failed to update inquiry status', error);
      toast({ title: 'Application update failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setUpdatingInquiryStatus(false);
    }
  };

  const checklist = [
    ...(applicationState
      ? [{ label: 'Application reviewed', complete: applicationState.status === 'reviewed' }]
      : []),
    { label: 'Store record created', complete: Boolean(workspaceStore) },
    { label: 'Contacts ready', complete: Boolean(workspaceStore) && effectiveSummary.hasContacts },
    { label: 'Card image ready', complete: Boolean(workspaceStore) && effectiveSummary.hasCardImage },
    { label: 'At least one offer', complete: Boolean(workspaceStore) && effectiveSummary.offerCount > 0 },
  ];
  const initialSetupItems = useMemo(() => [], []);

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <section className="rounded-[24px] border border-white/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(255,255,255,0.84))] p-5 shadow-[0_10px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>
              <h2 className="mt-2 text-xl font-extrabold text-[#111827]">Create Store</h2>
            </div>
            <span
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-semibold',
                workspaceStore ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-black/10 bg-white/80 text-muted-foreground',
              )}
            >
              {workspaceStore ? (workspaceSource === 'existing' ? 'Existing store loaded' : 'Store created') : 'Draft'}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {workspaceStore
              ? 'The store record is ready. Finish the customer-facing setup without leaving this page.'
              : 'Create the store record first, then complete contacts, media, and offers below.'}
          </p>

          <div className="mt-4 space-y-2">
            {publicStoreHref ? (
              <Link
                href={publicStoreHref}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(247,111,29,0.25)] transition hover:bg-brand/90"
              >
                View public store
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
            {workspaceStore ? (
              <Button type="button" variant="outline" className="w-full rounded-full" onClick={resetForAnotherStore}>
                Create another store
              </Button>
            ) : null}
          </div>
        </section>

        {applicationState ? (
          <section className="rounded-[24px] border border-white/70 bg-white/85 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.07)] ring-1 ring-white/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Application</p>
                <h3 className="mt-2 text-lg font-extrabold text-[#111827]">{applicationState.company || applicationState.name}</h3>
                {applicationCreatedLabel ? (
                  <p className="mt-1 text-xs text-muted-foreground">Submitted {applicationCreatedLabel}</p>
                ) : null}
              </div>
              <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold', statusChipClass(applicationState.status))}>
                {applicationState.status}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <p className="font-medium text-[#111827]">{applicationState.name}</p>
              <div className="flex flex-wrap gap-2">
                {applicantMailHref ? (
                  <a
                    href={applicantMailHref}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    Email
                  </a>
                ) : null}
                {applicantPhoneHref ? (
                  <a
                    href={applicantPhoneHref}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    Call
                  </a>
                ) : null}
                {applicantWhatsappHref ? (
                  <a
                    href={applicantWhatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                    WhatsApp
                  </a>
                ) : null}
                {applicantWebsiteHref ? (
                  <a
                    href={applicantWebsiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Website
                  </a>
                ) : null}
              </div>
              {applicationState.city ? (
                <p className="text-xs font-medium text-muted-foreground">City: {applicationState.city}</p>
              ) : null}
              <div className="rounded-2xl border border-black/10 bg-white/75 p-3.5 text-sm text-muted-foreground">
                {applicationState.message.trim() || 'No application note provided.'}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full rounded-full"
              disabled={updatingInquiryStatus}
              onClick={() => void updateInquiryStatus()}
            >
              {updatingInquiryStatus ? 'Updating...' : toggleInquiryStatusLabel}
            </Button>
          </section>
        ) : null}

        <section className="rounded-[24px] border border-white/70 bg-white/85 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.07)] ring-1 ring-white/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Progress</p>
          <div className="mt-4 space-y-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                {item.complete ? (
                  <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
                <span className={cn('text-sm', item.complete ? 'font-semibold text-[#111827]' : 'text-muted-foreground')}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <div id="store-workspace-right" className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <WorkspaceSection
            title="Basics"
            description="Start with the public-facing store details shoppers need to recognize the business."
            aside={
              workspaceStore ? (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Store record saved
                </span>
              ) : null
            }
          >
            {!workspaceStore ? (
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
                    className="h-11 rounded-xl bg-white/90"
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
                    className="h-11 rounded-xl bg-white/90"
                  />
                  <p className="text-xs text-muted-foreground">Will be saved as: {resolvedSlug || '-'}</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="store-description">Description</Label>
                  <Textarea
                    id="store-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Short intro about the store."
                    className="min-h-[112px] rounded-xl bg-white/90"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary city</Label>
                  <Select value={primaryCity} onValueChange={setPrimaryCity}>
                    <SelectTrigger className="h-11 rounded-xl bg-white/90">
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
                <div className="rounded-2xl border border-black/10 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-[#111827]">Store URL preview</p>
                  <p className="mt-2 text-sm text-muted-foreground">/sponsors/stores/{resolvedSlug || '-'}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Store name</p>
                  <p className="mt-1 text-sm font-semibold text-[#111827]">{effectiveStore?.name ?? name}</p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Slug</p>
                  <p className="mt-1 text-sm font-semibold text-[#111827]">/{effectiveStore?.slug ?? resolvedSlug}</p>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white/80 p-4 md:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Description</p>
                  <p className="mt-1 text-sm text-[#111827]">{effectiveStore?.description || 'No description yet.'}</p>
                </div>
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title="Publishing"
            description="Keep the core admin settings compact, with owner and ranking controls grouped together."
            aside={
              storeDetailsLoading ? (
                <span className="inline-flex rounded-full border border-black/10 bg-white/85 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Syncing...
                </span>
              ) : null
            }
          >
            {!workspaceStore ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="owner-user-id">Owner user ID</Label>
                    <Input
                      id="owner-user-id"
                      value={ownerUserId}
                      onChange={(event) => setOwnerUserId(event.target.value)}
                      placeholder="UUID"
                      className="h-11 rounded-xl bg-white/90"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                      <SelectTrigger className="h-11 rounded-xl bg-white/90">
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
                      <SelectTrigger className="h-11 rounded-xl bg-white/90">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="featured">Featured</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">Featured flag</p>
                        <p className="mt-1 text-xs text-muted-foreground">Highlights the store in ranking logic.</p>
                      </div>
                      <Switch checked={isFeatured} onCheckedChange={setIsFeatured} aria-label="Featured flag" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Link href="/admin/sponsors" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-[#F9FAFB]">
                    Cancel
                  </Link>
                  <Button type="submit" className="rounded-full px-5" disabled={!canSubmit}>
                    {submitting ? 'Creating...' : 'Create store'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Owner</p>
                    <p className="mt-1 text-sm font-semibold text-[#111827]">{effectiveStore?.ownerUserId || 'Not assigned'}</p>
                  </div>
                  <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm font-semibold text-[#111827]">{effectiveStore?.status || workspaceStore.status}</p>
                  </div>
                  <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sponsor tier</p>
                    <p className="mt-1 text-sm font-semibold text-[#111827]">{effectiveStore?.sponsorTier || sponsorTier}</p>
                  </div>
                  <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Featured</p>
                    <p className="mt-1 text-sm font-semibold text-[#111827]">{effectiveStore?.isFeatured ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                  The store record is saved. Continue below to finish customer-facing setup in this same workspace.
                </div>
              </div>
            )}
          </WorkspaceSection>
        </form>

        {workspaceStore && effectiveStore ? (
          <SponsorStoreSetupSections
            store={{
              id: effectiveStore.id,
              name: effectiveStore.name,
              slug: effectiveStore.slug,
              coverUrl: effectiveStore.coverUrl,
              phone: effectiveStore.phone,
              whatsapp: effectiveStore.whatsapp,
              website: effectiveStore.website,
              directionsUrl: effectiveStore.directionsUrl,
            }}
            initialItems={initialSetupItems}
            locale={locale}
            sponsoredLabel={sponsoredLabel}
            endsLabelTemplate={endsLabelTemplate}
            canDeleteStore
            isAdmin
            hydrateOnMount
            showGlobalSaveButton={false}
            onSummaryChange={setWorkspaceSummary}
            onStoreDeleted={() => resetForAnotherStore()}
          />
        ) : (
          <>
            <LockedWorkspaceCard
              title="Contacts"
              description="Phone, WhatsApp, directions, and website links live here once the store exists."
            />
            <LockedWorkspaceCard
              title="Card image"
              description="Upload the public-facing sponsor card image after the store record is created."
            />
            <LockedWorkspaceCard
              title="Offers"
              description="Add launch offers only after the store exists, so the full setup stays on one page."
            />
          </>
        )}
      </div>
    </div>
  );
}
