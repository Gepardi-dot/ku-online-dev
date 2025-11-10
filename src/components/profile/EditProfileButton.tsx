"use client";

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function EditProfileButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <Button
      className={className}
      onClick={() => router.push('/profile?tab=settings#profile-details')}
    >
      Edit Profile
    </Button>
  );
}

