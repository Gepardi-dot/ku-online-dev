"use client";

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/providers/locale-provider';

export default function EditProfileButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const { t } = useLocale();
  return (
    <Button
      className={className}
      onClick={() => router.push('/profile?tab=profile#profile-details')}
    >
      {t('profile.form.heading')}
    </Button>
  );
}
