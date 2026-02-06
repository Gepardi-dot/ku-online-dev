'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type PrototypeClaimVoucherButtonProps = {
  href: string;
  labels: {
    claim: string;
    claiming: string;
    successTitle: string;
    successDescription: string;
  };
};

export function PrototypeClaimVoucherButton({ href, labels }: PrototypeClaimVoucherButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [claiming, setClaiming] = useState(false);

  const onClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      // Demo only (no API call). This simulates a successful claim and opens the voucher detail.
      toast({ title: labels.successTitle, description: labels.successDescription, variant: 'brand' });
      router.push(href);
      router.refresh();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Button type="button" className="h-11 rounded-full bg-brand text-white shadow-sm hover:bg-brand/90" disabled={claiming} onClick={onClaim}>
      {claiming ? labels.claiming : labels.claim}
    </Button>
  );
}

