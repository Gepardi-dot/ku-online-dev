'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'needs_info' | null;

type Props = {
  isVerified: boolean;
  latestStatus: VerificationStatus;
  submittedAt?: string | null;
  defaultPhone?: string | null;
};

export function VerifyBadgeDialog({ isVerified, latestStatus, submittedAt, defaultPhone }: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? '');
  const [idDocUrl, setIdDocUrl] = useState('');
  const [bizDocUrl, setBizDocUrl] = useState('');
  const [notes, setNotes] = useState('');

  const statusLabel = useMemo(() => {
    if (isVerified) return t('profile.verification.status.verified');
    if (latestStatus === 'pending') return t('profile.verification.status.pending');
    if (latestStatus === 'approved') return t('profile.verification.status.approved');
    if (latestStatus === 'rejected') return t('profile.verification.status.rejected');
    if (latestStatus === 'needs_info') return t('profile.verification.status.needsInfo');
    return null;
  }, [isVerified, latestStatus, t]);

  const canApply = !isVerified && latestStatus !== 'pending';

  const handleSubmit = async () => {
    if (!phone.trim() || !idDocUrl.trim() || !bizDocUrl.trim()) {
      toast({
        title: t('profile.verification.toast.missingTitle'),
        description: t('profile.verification.toast.missingDescription'),
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/verification/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          idDocumentUrl: idDocUrl,
          businessDocumentUrl: bizDocUrl,
          notes,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description = typeof payload?.error === 'string' ? payload.error : 'Unable to submit right now.';
        toast({
          title: t('profile.verification.toast.errorTitle'),
          description,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('profile.verification.toast.successTitle'),
        description: t('profile.verification.toast.successDescription'),
      });
      setOpen(false);
    } catch (error) {
      console.error('Failed to submit verification request', error);
      toast({
        title: t('profile.verification.toast.errorTitle'),
        description: t('profile.verification.toast.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      {statusLabel ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          <span>{statusLabel}</span>
          {submittedAt ? <span className="text-xs text-muted-foreground">({new Date(submittedAt).toLocaleString()})</span> : null}
        </div>
      ) : null}

      {canApply && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="default">
              <ShieldCheck className="mr-2 h-4 w-4" />
              {t('profile.verification.cta')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('profile.verification.dialogTitle')}</DialogTitle>
              <DialogDescription>{t('profile.verification.dialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="verify-phone">{t('profile.verification.fields.phone')}</Label>
                <Input
                  id="verify-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+964 770 123 4567"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="verify-id">{t('profile.verification.fields.id')}</Label>
                <Input
                  id="verify-id"
                  value={idDocUrl}
                  onChange={(e) => setIdDocUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="verify-biz">{t('profile.verification.fields.business')}</Label>
                <Input
                  id="verify-biz"
                  value={bizDocUrl}
                  onChange={(e) => setBizDocUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="verify-notes">{t('profile.verification.fields.notes')}</Label>
                <div className="relative">
                  <Input
                    id="verify-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('profile.verification.fields.notesPlaceholder')}
                  />
                  <UploadCloud className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                {t('profile.verification.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? t('profile.verification.submitting') : t('profile.verification.submit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
