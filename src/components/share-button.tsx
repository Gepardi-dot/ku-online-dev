'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Share2 } from 'lucide-react';

type ShareButtonProps = {
  title: string;
  url: string;
  text?: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg' | null;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'link' | null;
};

export default function ShareButton({ title, url, text, className, size = 'sm', variant = 'secondary' }: ShareButtonProps) {
  const handleShare = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title, text: text ?? title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Share this product with your friends.' });
    } catch (e) {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied', description: 'Share this product with your friends.' });
      } catch {
        // no-op
      }
    }
  }, [title, text, url]);

  return (
    <Button size={size ?? undefined} variant={variant ?? undefined} className={className} onClick={handleShare}>
      <Share2 className="h-4 w-4" />
    </Button>
  );
}

