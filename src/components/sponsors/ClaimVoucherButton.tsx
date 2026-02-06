'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type ClaimVoucherButtonProps = {
  offerId: string;
  disabled?: boolean;
  labels: {
    claim: string;
    claiming: string;
    loginRequiredTitle: string;
    loginRequiredDescription: string;
    successTitle: string;
    successDescription: string;
    alreadyClaimedTitle: string;
    alreadyClaimedDescription: string;
    expiredTitle: string;
    expiredDescription: string;
    failedTitle: string;
    failedDescription: string;
  };
};

export function ClaimVoucherButton({ offerId, disabled, labels }: ClaimVoucherButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [claiming, setClaiming] = useState(false);

  const claim = async () => {
    if (!offerId || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch(`/api/sponsors/offers/${encodeURIComponent(offerId)}/claim`, { method: 'POST' });
      const payload = (await res.json().catch(() => ({}))) as any;

      if (res.status === 401) {
        toast({
          title: labels.loginRequiredTitle,
          description: labels.loginRequiredDescription,
          variant: 'brand',
        });
        return;
      }

      if (!res.ok || !payload?.ok) {
        const code = typeof payload?.code === 'string' ? payload.code : '';
        if (res.status === 409 || code === 'CLAIM_LIMIT_REACHED') {
          toast({
            title: labels.alreadyClaimedTitle,
            description: labels.alreadyClaimedDescription,
            variant: 'brand',
          });
          return;
        }
        if (res.status === 410 || code === 'OFFER_EXPIRED') {
          toast({
            title: labels.expiredTitle,
            description: labels.expiredDescription,
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: labels.failedTitle,
          description: labels.failedDescription,
          variant: 'destructive',
        });
        return;
      }

      const claimId = payload?.claim?.id as string | undefined;
      const code = payload?.claim?.code as string | undefined;
      toast({
        title: labels.successTitle,
        description: code ? `${labels.successDescription} ${code}` : labels.successDescription,
        variant: 'brand',
      });

      if (claimId) {
        router.push(`/vouchers/${encodeURIComponent(claimId)}?claimed=1`);
        return;
      }

      router.push('/vouchers');
    } catch (error) {
      toast({
        title: labels.failedTitle,
        description: labels.failedDescription,
        variant: 'destructive',
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Button disabled={disabled || claiming} className="h-11 rounded-full px-6 font-semibold" onClick={claim}>
      {claiming ? labels.claiming : labels.claim}
    </Button>
  );
}

