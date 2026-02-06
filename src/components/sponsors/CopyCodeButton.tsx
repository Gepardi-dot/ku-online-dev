'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type CopyCodeButtonProps = {
  code: string;
  labels: {
    copy: string;
    copiedTitle: string;
    copiedDescription: string;
    failedTitle: string;
    failedDescription: string;
  };
};

export function CopyCodeButton({ code, labels }: CopyCodeButtonProps) {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);

  const onCopy = async () => {
    if (!code || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: labels.copiedTitle, description: labels.copiedDescription, variant: 'brand' });
    } catch {
      toast({ title: labels.failedTitle, description: labels.failedDescription, variant: 'destructive' });
    } finally {
      setCopying(false);
    }
  };

  return (
    <Button type="button" variant="secondary" className="h-11 rounded-full bg-white text-primary shadow-sm" onClick={onCopy}>
      {labels.copy}
    </Button>
  );
}

