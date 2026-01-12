'use client';

import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import { Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ProductShareButtonProps {
  title: string;
  url: string;
  variant?: 'icon' | 'default';
  className?: string;
}

const COPY_RESET_TIMEOUT = 2000;

export default function ProductShareButton({
  title,
  url,
  variant = 'default',
  className,
}: ProductShareButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const Icon = useMemo(() => (copied ? Check : Share2), [copied]);

  const resetCopied = useCallback(() => {
    setTimeout(() => setCopied(false), COPY_RESET_TIMEOUT);
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'absolute';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    setCopied(true);
    toast({
      title: 'Link copied',
      description: 'Share this listing with your friends.',
    });
    resetCopied();
  }, [toast, url, resetCopied]);

  const handleShare = useCallback(async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }

      await copyToClipboard();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to share product', error);
      toast({
        title: 'Unable to share',
        description: 'Please try copying the link manually.',
        variant: 'destructive',
      });
    }
  }, [copyToClipboard, title, toast, url]);

  const content = variant === 'icon'
    ? (
      <>
        <Icon className="h-4 w-4" />
        <span className="sr-only">Share listing</span>
      </>
    )
    : (
      <>
        <Icon className="mr-2 h-4 w-4" />
        Share Listing
      </>
    );

  const buttonProps = variant === 'icon'
    ? {
      size: 'sm' as const,
      variant: 'secondary' as const,
      className: cn('h-8 w-8 rounded-full p-0', className),
    }
    : {
      variant: 'outline' as const,
      className: cn('w-full', className),
    };

  return (
    <Button {...buttonProps} onClick={handleShare}>
      {content}
    </Button>
  );
}
