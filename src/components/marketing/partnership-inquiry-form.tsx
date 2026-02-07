'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { getPublicEnv } from '@/lib/env-public';
import {
  PARTNERSHIP_TYPE_CODES,
  PARTNERSHIP_TYPE_LABEL_KEYS,
  SELLER_APPLICATION_TYPE,
  type PartnershipTypeCode,
} from '@/lib/partnership-types';
import { cn } from '@/lib/utils';
import { useLocale } from '@/providers/locale-provider';

type PartnershipInquiryFormProps = {
  onClose: () => void;
  mode?: 'partner' | 'seller';
  isSignedIn?: boolean;
  initialPartnershipType?: PartnershipTypeCode;
  panelTitle?: string;
  panelDescription?: string;
};

type PartnershipFormState = {
  name: string;
  company: string;
  email: string;
  website: string;
  partnershipType: string;
  message: string;
  budgetRange: string;
  country: string;
  city: string;
  phone: string;
  attachmentUrl: string;
};

type RuntimeContacts = {
  supportEmail: string | null;
  supportWhatsapp: string | null;
  source: 'db' | 'env' | 'none';
};

const initialState: PartnershipFormState = {
  name: '',
  company: '',
  email: '',
  website: '',
  partnershipType: '',
  message: '',
  budgetRange: '',
  country: '',
  city: '',
  phone: '',
  attachmentUrl: '',
};

function toWhatsAppHref(value: string | null | undefined, message: string): string | null {
  const normalized = (value ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+').trim();
  if (!normalized) return null;
  const number = normalized.startsWith('+') ? normalized.slice(1) : normalized;
  if (!number) return null;
  const query = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${encodeURIComponent(number)}${query}`;
}

export function PartnershipInquiryForm({
  onClose,
  mode = 'partner',
  isSignedIn = false,
  initialPartnershipType,
  panelTitle,
  panelDescription,
}: PartnershipInquiryFormProps) {
  const { t } = useLocale();
  const isSellerMode = mode === 'seller';
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState<PartnershipFormState>({
    ...initialState,
    partnershipType: initialPartnershipType ?? (isSellerMode ? SELLER_APPLICATION_TYPE : ''),
  });
  const [honeypot, setHoneypot] = useState('');

  const partnershipOptions = useMemo(() => {
    return PARTNERSHIP_TYPE_CODES.map((code) => ({
      code,
      label: t(PARTNERSHIP_TYPE_LABEL_KEYS[code]),
    }));
  }, [t]);

  const publicEnv = useMemo(() => {
    try {
      return getPublicEnv();
    } catch {
      return null;
    }
  }, []);
  const fallbackEmail = publicEnv?.NEXT_PUBLIC_PARTNERSHIPS_EMAIL?.trim() || null;
  const fallbackWhatsapp = publicEnv?.NEXT_PUBLIC_PARTNERSHIPS_WHATSAPP?.trim() || null;
  const [runtimeContacts, setRuntimeContacts] = useState<RuntimeContacts>({
    supportEmail: fallbackEmail,
    supportWhatsapp: fallbackWhatsapp,
    source: fallbackEmail || fallbackWhatsapp ? 'env' : 'none',
  });
  const supportEmail = runtimeContacts.supportEmail?.trim() ?? '';
  const whatsappHref = toWhatsAppHref(
    runtimeContacts.supportWhatsapp,
    isSellerMode ? t('partnership.sellerContactPrefill') : t('partnership.partnerContactPrefill'),
  );
  const emailHref = supportEmail
    ? `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(
        isSellerMode ? t('partnership.sellerContactEmailSubject') : t('partnership.partnerContactEmailSubject'),
      )}`
    : null;
  const selectedTypeLabel =
    partnershipOptions.find((option) => option.code === formState.partnershipType)?.label ??
    t('partnership.options.influencer');

  useEffect(() => {
    if (!isSellerMode) return;
    setFormState((prev) => ({
      ...prev,
      partnershipType: SELLER_APPLICATION_TYPE,
    }));
  }, [isSellerMode]);

  useEffect(() => {
    let active = true;
    const loadContacts = async () => {
      try {
        const res = await fetch('/api/app/contacts', { method: 'GET', cache: 'no-store' });
        const payload = await res.json().catch(() => ({}));
        if (!active || !res.ok || !payload?.ok || !payload?.contacts) return;
        const contacts = payload.contacts as {
          supportEmail?: string | null;
          supportWhatsapp?: string | null;
          source?: 'db' | 'env' | 'none';
        };
        setRuntimeContacts({
          supportEmail: typeof contacts.supportEmail === 'string' ? contacts.supportEmail : null,
          supportWhatsapp: typeof contacts.supportWhatsapp === 'string' ? contacts.supportWhatsapp : null,
          source: contacts.source ?? 'none',
        });
      } catch {}
    };
    loadContacts();
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setFormState({
      ...initialState,
      partnershipType: initialPartnershipType ?? (isSellerMode ? SELLER_APPLICATION_TYPE : ''),
    });
    setHoneypot('');
  };

  const closeDialog = () => {
    resetForm();
    onClose();
  };

  const updateField = (field: keyof PartnershipFormState) => (value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const requiredValues = [
      formState.name.trim(),
      formState.email.trim(),
      formState.partnershipType.trim(),
      formState.message.trim(),
    ];

    if (requiredValues.some((value) => !value)) {
      toast({
        title: t('partnership.toast.missingTitle'),
        description: t('partnership.toast.missingDescription'),
        variant: 'destructive',
      });
      return;
    }

    if (!formState.email.includes('@')) {
      toast({
        title: t('partnership.toast.invalidEmailTitle'),
        description: t('partnership.toast.invalidEmailDescription'),
        variant: 'destructive',
      });
      return;
    }

    if (isSellerMode && !isSignedIn) {
      toast({
        title: t('partnership.toast.errorTitle'),
        description: t('header.loginRequired'),
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/partnerships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formState,
          partnershipTypeLabel: selectedTypeLabel,
          honeypot,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description =
          typeof payload?.error === 'string' ? payload.error : t('partnership.toast.errorDescription');
        toast({
          title: t('partnership.toast.errorTitle'),
          description,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('partnership.toast.successTitle'),
        description: t('partnership.toast.successDescription'),
      });

      if (!payload?.emailSent && payload?.mailto) {
        window.location.href = payload.mailto;
      }

      closeDialog();
    } catch (error) {
      console.error('Failed to submit partnership inquiry', error);
      toast({
        title: t('partnership.toast.errorTitle'),
        description: t('partnership.toast.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{panelTitle ?? t('partnership.formTitle')}</DialogTitle>
        <DialogDescription>{panelDescription ?? t('partnership.formDescription')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {isSellerMode ? (
          <div className="md:col-span-2 rounded-xl border border-black/10 bg-white/70 p-3.5">
            <p className="text-sm font-semibold text-foreground" dir="auto">
              {t('partnership.sellerPoliciesTitle')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" dir="auto">
              {t('partnership.sellerPolicyReview')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" dir="auto">
              {t('partnership.sellerPolicyPublish')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" dir="auto">
              {t('partnership.sellerPolicyPayment')}
            </p>
          </div>
        ) : null}

        <div className="md:col-span-2 rounded-xl border border-black/10 bg-white/70 p-3.5">
          <p className="text-sm font-semibold text-foreground" dir="auto">
            {isSellerMode ? t('partnership.sellerContactTitle') : t('partnership.partnerContactTitle')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={whatsappHref ?? '#'}
              target={whatsappHref ? '_blank' : undefined}
              rel={whatsappHref ? 'noreferrer' : undefined}
              className={cn(
                'inline-flex h-9 items-center justify-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white hover:bg-[#1FB857]',
                !whatsappHref && 'pointer-events-none opacity-60',
              )}
              aria-disabled={!whatsappHref}
            >
              {t('partnership.contactWhatsapp')}
            </a>
            <a
              href={emailHref ?? '#'}
              className={cn(
                'inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-foreground hover:bg-accent',
                !emailHref && 'pointer-events-none opacity-60',
              )}
              aria-disabled={!emailHref}
            >
              {t('partnership.contactEmail')}
            </a>
          </div>
          {runtimeContacts.source !== 'db' ? (
            <p className="mt-2 text-xs text-muted-foreground" dir="auto">
              {t('partnership.contactFallbackNotice')}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="partner-name">{t('partnership.fields.name')}</Label>
          <Input
            id="partner-name"
            value={formState.name}
            onChange={(event) => updateField('name')(event.target.value)}
            placeholder={t('partnership.fields.namePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-company">{t('partnership.fields.company')}</Label>
          <Input
            id="partner-company"
            value={formState.company}
            onChange={(event) => updateField('company')(event.target.value)}
            placeholder={t('partnership.fields.companyPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-email">{t('partnership.fields.email')}</Label>
          <Input
            id="partner-email"
            type="email"
            value={formState.email}
            onChange={(event) => updateField('email')(event.target.value)}
            placeholder={t('partnership.fields.emailPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-website">{t('partnership.fields.website')}</Label>
          <Input
            id="partner-website"
            value={formState.website}
            onChange={(event) => updateField('website')(event.target.value)}
            placeholder={t('partnership.fields.websitePlaceholder')}
          />
        </div>
        {!isSellerMode ? (
          <div className="space-y-2">
            <Label htmlFor="partner-type">{t('partnership.fields.partnershipType')}</Label>
            <Select
              value={formState.partnershipType}
              onValueChange={(value) => updateField('partnershipType')(value)}
            >
              <SelectTrigger id="partner-type">
                <SelectValue placeholder={t('partnership.fields.partnershipTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {partnershipOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="partner-budget">{t('partnership.fields.budget')}</Label>
          <Input
            id="partner-budget"
            value={formState.budgetRange}
            onChange={(event) => updateField('budgetRange')(event.target.value)}
            placeholder={t('partnership.fields.budgetPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-country">{t('partnership.fields.country')}</Label>
          <Input
            id="partner-country"
            value={formState.country}
            onChange={(event) => updateField('country')(event.target.value)}
            placeholder={t('partnership.fields.countryPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-city">{t('partnership.fields.city')}</Label>
          <Input
            id="partner-city"
            value={formState.city}
            onChange={(event) => updateField('city')(event.target.value)}
            placeholder={t('partnership.fields.cityPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-phone">{t('partnership.fields.phone')}</Label>
          <Input
            id="partner-phone"
            value={formState.phone}
            onChange={(event) => updateField('phone')(event.target.value)}
            placeholder={t('partnership.fields.phonePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-attachment">{t('partnership.fields.attachment')}</Label>
          <Input
            id="partner-attachment"
            value={formState.attachmentUrl}
            onChange={(event) => updateField('attachmentUrl')(event.target.value)}
            placeholder={t('partnership.fields.attachmentPlaceholder')}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="partner-message">{t('partnership.fields.message')}</Label>
          <Textarea
            id="partner-message"
            value={formState.message}
            onChange={(event) => updateField('message')(event.target.value)}
            placeholder={t('partnership.fields.messagePlaceholder')}
            rows={4}
          />
        </div>

        <div className="hidden">
          <Label htmlFor="partner-honeypot">{t('partnership.fields.honeypot')}</Label>
          <Input
            id="partner-honeypot"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" dir="auto">
            {isSellerMode && !isSignedIn ? t('partnership.sellerSignInNotice') : t('partnership.privacyNote')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
              {t('partnership.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || (isSellerMode && !isSignedIn)}>
              {submitting ? t('partnership.submitting') : t('partnership.submit')}
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}
