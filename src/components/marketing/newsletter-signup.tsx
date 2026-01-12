'use client';

import { FormEvent, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/providers/locale-provider';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { rtlLocales } from '@/lib/locale/dictionary';

type NewsletterSignupProps = {
  className?: string;
};

export function NewsletterSignup({ className }: NewsletterSignupProps) {
  const { t, locale } = useLocale();
  const isRtl = rtlLocales.includes(locale);
  const [email, setEmail] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !email.includes('@')) {
      toast({
        title: t('homepage.subscribeError'),
        description: t('homepage.subscribePlaceholder'),
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: t('homepage.subscribeSuccess'),
    });
    setEmail('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn("mx-auto flex w-full max-w-md", className)}
    >
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t('homepage.subscribePlaceholder')}
        aria-label={t('homepage.subscribePlaceholder')}
        className={cn(
          "flex-1 text-gray-800 focus:outline-none",
          isRtl ? "rounded-r-full rounded-l-none text-right" : "rounded-l-full rounded-r-none"
        )}
      />
      <Button
        type="submit"
        className={cn(
          "bg-accent-foreground py-3 px-6 font-semibold hover:bg-orange-800 transition",
          isRtl ? "rounded-l-full rounded-r-none" : "rounded-r-full rounded-l-none"
        )}
      >
        {t('homepage.subscribeButton')}
      </Button>
    </form>
  );
}
