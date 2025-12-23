'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/providers/locale-provider';

type ReportListingDialogProps = {
  productId: string;
  sellerId?: string | null;
};

const REASONS = [
  'report.reasonScam',
  'report.reasonIllegal',
  'report.reasonOffensive',
  'report.reasonSuspicious',
  'report.reasonOther',
] as const;

export function ReportListingDialog({ productId, sellerId }: ReportListingDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number] | ''>('');
  const [details, setDetails] = useState('');
  const { t } = useLocale();

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: t('report.selectReason'),
        description: t('report.selectReasonHint'),
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/abuse/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'product',
          targetId: productId,
          reason,
          details,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        const description = typeof payload?.error === 'string' ? payload.error : t('report.submitError');
        toast({
          title: t('report.submitErrorTitle'),
          description,
          variant: 'destructive',
        });
        return;
      }

      if (sellerId) {
        await fetch('/api/abuse/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetType: 'user',
            targetId: sellerId,
            reason: `Listing report: ${reason}`,
            details,
          }),
        }).catch(() => undefined);
      }

      toast({
        title: t('report.submitSuccessTitle'),
        description: t('report.submitSuccess'),
      });
      setOpen(false);
      setReason('');
      setDetails('');
    } catch (error) {
      console.error('Failed to submit report', error);
      toast({
        title: t('report.submitErrorTitle'),
        description: t('report.submitError'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <Flag className="mr-2 h-4 w-4" />
          {t('report.button')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('report.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('report.reasonLabel')}</Label>
            <RadioGroup value={reason} onValueChange={(value) => setReason(value as (typeof REASONS)[number])}>
              {REASONS.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem id={option} value={option} />
                  <Label htmlFor={option} className="text-sm">
                    {t(option)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-details" className="text-sm font-medium">
              {t('report.detailsLabel')}
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t('report.detailsPlaceholder')}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            {t('report.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('report.submitting') : t('report.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
