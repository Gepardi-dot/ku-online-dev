'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';
import { rtlLocales } from '@/lib/locale/dictionary';
import { getPublicEnv } from '@/lib/env-public';

type PartnershipType =
  | 'influencer'
  | 'sponsorship'
  | 'store_onboarding'
  | 'affiliate'
  | 'press'
  | 'integration'
  | 'other';

export function PartnershipInquiry() {
  const { t, locale } = useLocale();
  const isRtl = rtlLocales.includes(locale);
  const direction = isRtl ? 'rtl' : 'ltr';

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [type, setType] = useState<PartnershipType>('influencer');
  const [message, setMessage] = useState('');

  const partnershipsEmail = useMemo(() => {
    try {
      const env = getPublicEnv();
      return env.NEXT_PUBLIC_PARTNERSHIPS_EMAIL ?? 'hello@ku-online.app';
    } catch {
      return 'hello@ku-online.app';
    }
  }, []);

  const reset = () => {
    setName('');
    setCompany('');
    setEmail('');
    setWebsite('');
    setType('influencer');
    setMessage('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedEmail.includes('@') || !trimmedMessage) {
      toast({ title: t('homepage.partnerError'), variant: 'destructive' });
      return;
    }

    const subject = t('homepage.partnerEmailSubject');
    const bodyLines = [
      `${t('homepage.partnerFieldName')}: ${trimmedName}`,
      `${t('homepage.partnerFieldCompany')}: ${company.trim() || '-'}`,
      `${t('homepage.partnerFieldEmail')}: ${trimmedEmail}`,
      `${t('homepage.partnerFieldWebsite')}: ${website.trim() || '-'}`,
      `${t('homepage.partnerFieldType')}: ${type}`,
      '',
      t('homepage.partnerFieldMessage') + ':',
      trimmedMessage,
      '',
      t('homepage.partnerAutoFooter'),
    ];
    const mailto = `mailto:${encodeURIComponent(partnershipsEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      bodyLines.join('\n'),
    )}`;

    setOpen(false);
    toast({ title: t('homepage.partnerSuccess') });
    reset();

    if (typeof window !== 'undefined') {
      window.location.href = mailto;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="h-10 rounded-full bg-white/15 text-white hover:bg-white/20"
        >
          <Handshake className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('homepage.partnerButton')}
        </Button>
      </DialogTrigger>
      <DialogContent dir={direction} className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('homepage.partnerDialogTitle')}</DialogTitle>
          <DialogDescription>{t('homepage.partnerDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="partner-name">{t('homepage.partnerFieldName')}</Label>
              <Input
                id="partner-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('homepage.partnerPlaceholderName')}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="partner-company">{t('homepage.partnerFieldCompany')}</Label>
              <Input
                id="partner-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('homepage.partnerPlaceholderCompany')}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="partner-email">{t('homepage.partnerFieldEmail')}</Label>
              <Input
                id="partner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('homepage.partnerPlaceholderEmail')}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="partner-website">{t('homepage.partnerFieldWebsite')}</Label>
              <Input
                id="partner-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t('homepage.partnerPlaceholderWebsite')}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="partner-type">{t('homepage.partnerFieldType')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as PartnershipType)}>
              <SelectTrigger id="partner-type">
                <SelectValue placeholder={t('homepage.partnerPlaceholderType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="influencer">{t('homepage.partnerTypeInfluencer')}</SelectItem>
                <SelectItem value="sponsorship">{t('homepage.partnerTypeSponsorship')}</SelectItem>
                <SelectItem value="store_onboarding">{t('homepage.partnerTypeStore')}</SelectItem>
                <SelectItem value="affiliate">{t('homepage.partnerTypeAffiliate')}</SelectItem>
                <SelectItem value="press">{t('homepage.partnerTypePress')}</SelectItem>
                <SelectItem value="integration">{t('homepage.partnerTypeIntegration')}</SelectItem>
                <SelectItem value="other">{t('homepage.partnerTypeOther')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="partner-message">{t('homepage.partnerFieldMessage')}</Label>
            <Textarea
              id="partner-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('homepage.partnerPlaceholderMessage')}
              className="min-h-[120px]"
              required
            />
            <p className="text-xs text-muted-foreground">{t('homepage.partnerPrivacy')}</p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              {t('homepage.partnerCancel')}
            </Button>
            <Button type="submit">{t('homepage.partnerSubmit')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

