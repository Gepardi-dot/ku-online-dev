'use client';

import { FormEvent, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/providers/locale-provider';
import { toast } from '@/hooks/use-toast';
import { rtlLocales } from '@/lib/locale/dictionary';
import { cn } from '@/lib/utils';

export function NewsletterSignup() {
  const { t, locale } = useLocale();
  const [email, setEmail] = useState('');
  const isRtl = rtlLocales.includes(locale);

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

  const inputClassName = cn(
    'flex-1 text-gray-800 focus:outline-none',
    isRtl ? 'rounded-s-none rounded-e-full' : 'rounded-s-full rounded-e-none',
  );

  const buttonClassName = cn(
    'bg-accent-foreground py-3 px-6 font-semibold hover:bg-orange-800 transition',
    isRtl ? 'rounded-s-full rounded-e-none' : 'rounded-s-none rounded-e-full',
  );

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto flex">
      {isRtl ? (
        <>
          <Button type="submit" className={buttonClassName}>
            {t('homepage.subscribeButton')}
          </Button>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('homepage.subscribePlaceholder')}
            aria-label={t('homepage.subscribePlaceholder')}
            className={inputClassName}
          />
        </>
      ) : (
        <>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('homepage.subscribePlaceholder')}
            aria-label={t('homepage.subscribePlaceholder')}
            className={inputClassName}
          />
          <Button type="submit" className={buttonClassName}>
            {t('homepage.subscribeButton')}
          </Button>
        </>
      )}
    </form>
  );
}
