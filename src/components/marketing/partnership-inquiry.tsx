'use client';

import { FormEvent, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';
import { cn } from '@/lib/utils';

type PartnershipInquiryProps = {
  buttonClassName?: string;
  className?: string;
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

export function PartnershipInquiry({ buttonClassName, className }: PartnershipInquiryProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState<PartnershipFormState>(initialState);
  const [honeypot, setHoneypot] = useState('');

  const partnershipOptions = useMemo(
    () => [
      t('partnership.options.influencer'),
      t('partnership.options.sponsored'),
      t('partnership.options.storeOnboarding'),
      t('partnership.options.affiliate'),
      t('partnership.options.pr'),
      t('partnership.options.integrations'),
      t('partnership.options.investment'),
    ],
    [t],
  );

  const resetForm = () => {
    setFormState(initialState);
    setHoneypot('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
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

    setSubmitting(true);
    try {
      const res = await fetch('/api/partnerships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formState, honeypot }),
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
      setOpen(false);
      resetForm();

      if (!payload?.emailSent && payload?.mailto) {
        window.location.href = payload.mailto;
      }
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
    <div className={cn('flex flex-col items-center gap-4 md:items-start', className)}>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            className={cn(
              'h-11 w-full rounded-full bg-white px-6 text-base font-semibold text-primary shadow-sm hover:bg-white/90 md:w-auto',
              buttonClassName,
            )}
          >
            {t('partnership.ctaButton')}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('partnership.formTitle')}</DialogTitle>
            <DialogDescription>{t('partnership.formDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{t('partnership.privacyNote')}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                  {t('partnership.cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('partnership.submitting') : t('partnership.submit')}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
