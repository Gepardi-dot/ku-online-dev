'use client';

import { FormEvent, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/providers/locale-provider';
import { toast } from '@/hooks/use-toast';

export function NewsletterSignup() {
  const { t } = useLocale();
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
    <form onSubmit={handleSubmit} className="max-w-md mx-auto flex">
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t('homepage.subscribePlaceholder')}
        aria-label={t('homepage.subscribePlaceholder')}
        className="flex-1 rounded-l-full text-gray-800 focus:outline-none"
      />
      <Button
        type="submit"
        className="bg-accent-foreground py-3 px-6 rounded-r-full font-semibold hover:bg-orange-800 transition"
      >
        {t('homepage.subscribeButton')}
      </Button>
    </form>
  );
}
