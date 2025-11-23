'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';

type ReportListingDialogProps = {
  productId: string;
  sellerId?: string | null;
};

const REASONS = [
  'Scam or fraud',
  'Prohibited or illegal item',
  'Offensive or abusive content',
  'Suspicious account behaviour',
  'Other',
] as const;

export function ReportListingDialog({ productId, sellerId }: ReportListingDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number] | ''>('');
  const [details, setDetails] = useState('');

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: 'Choose a reason',
        description: 'Please select why you are reporting this listing.',
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
        const description = typeof payload?.error === 'string'
          ? payload.error
          : 'We could not submit your report. Please try again shortly.';
        toast({
          title: 'Report not submitted',
          description,
          variant: 'destructive',
        });
        return;
      }

      // Optionally also attach a user-level report when sellerId is available.
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
        }).catch(() => {
          // User-level report is best-effort; ignore failures here.
        });
      }

      toast({
        title: 'Report submitted',
        description: 'Thank you for helping keep KU Online safe. Our team will review this listing.',
      });
      setOpen(false);
      setReason('');
      setDetails('');
    } catch (error) {
      console.error('Failed to submit report', error);
      toast({
        title: 'Report not submitted',
        description: 'We could not submit your report. Please try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Flag className="mr-2 h-4 w-4" />
          Report Listing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this listing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reason</Label>
            <RadioGroup value={reason} onValueChange={(value) => setReason(value as (typeof REASONS)[number])}>
              {REASONS.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem id={option} value={option} />
                  <Label htmlFor={option} className="text-sm">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-details" className="text-sm font-medium">
              Additional details (optional)
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Describe what happened, including any links, usernames, or context that can help our team."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

