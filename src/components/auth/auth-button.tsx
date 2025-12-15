'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, LogOut, Phone, Mail, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { getPublicEnv } from '@/lib/env-public';
import { useLocale } from '@/providers/locale-provider';
import { isModerator } from '@/lib/auth/roles';

interface AuthButtonProps {
  user: any;
}

export default function AuthButton({ user }: AuthButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const supabase = createClient();
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== 'profile-menu') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('ku-menu-open', handler);
    return () => window.removeEventListener('ku-menu-open', handler);
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      // Prefer the actual browser origin to avoid stale env values on Vercel.
      // Fallback to NEXT_PUBLIC_SITE_URL only when window is not available (SSR/dev tools).
      let origin = (typeof window !== 'undefined' ? window.location.origin : NEXT_PUBLIC_SITE_URL) || 'http://localhost:5000';
      // Normalize invalid host 0.0.0.0 for OAuth callbacks.
      origin = origin.replace('://0.0.0.0', '://localhost');

      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });
    } catch (error) {
      console.error('Error logging in with Google:', error);
    }
    setIsLoading(false);
  };

  const handlePhoneLogin = async () => {
    setIsLoading(true);
    setPhoneError(null);
    try {
      const raw = phone.trim();
      if (!raw) {
        setPhoneError('Please enter your phone number.');
        return;
      }

      // Normalise international numbers like 0044... to +44...
      let normalized = raw;
      if (normalized.startsWith('00')) {
        normalized = `+${normalized.slice(2)}`;
      }

      // Basic E.164-style validation; Supabase/Twilio expect international format.
      if (!/^\+?[0-9]{7,15}$/.test(normalized)) {
        setPhoneError('Enter a valid phone number in international format (e.g. +9647501234567).');
        return;
      }

      setPhone(normalized);

      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: { channel: 'sms' },
      });
      if (!error) {
        setShowOtpInput(true);
      } else {
        setPhoneError(error.message ?? 'Could not send verification code. Please try again.');
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      setPhoneError('Could not send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerification = async () => {
    setIsLoading(true);
    setOtpError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      if (!error) {
        window.location.reload();
      } else {
        setOtpError(error.message ?? 'Invalid or expired code. Please try again.');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setOtpError('Invalid or expired code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    window.location.reload();
  };

  if (user) {
    const userIsModerator = isModerator(user);

    return (
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          if (next && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ku-menu-open', { detail: { source: 'profile-menu' } }));
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.user_metadata?.avatar_url} alt={user.user_metadata?.full_name} />
              <AvatarFallback>
                {user.user_metadata?.full_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="z-[90] w-56 rounded-3xl border border-white/50 bg-gradient-to-br from-white/85 via-white/70 to-primary/10 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-2xl ring-1 ring-white/40"
          align="end"
          sideOffset={10}
          forceMount
        >
          <DropdownMenuItem className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.user_metadata?.full_name || t('header.userMenu.defaultName')}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile?tab=overview" className="flex items-center">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              {t('header.userMenu.myProfile')}
            </Link>
          </DropdownMenuItem>
          {userIsModerator && (
            <DropdownMenuItem asChild>
              <Link href="/admin/moderation" className="flex items-center">
                <ShieldCheck className="mr-2 h-4 w-4" />
                {t('header.userMenu.moderation')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/profile?tab=settings" className="flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              {t('header.userMenu.settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>{t('header.userMenu.logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <User className="mr-2 h-4 w-4" />
          {t('header.signIn')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Sign in to KU-ONLINE</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button onClick={handleGoogleLogin} disabled={isLoading} className="w-full">
            <Mail className="mr-2 h-4 w-4" />
            Continue with Google
          </Button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          {!showOtpInput ? (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+964 750 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {phoneError && (
                <p className="text-xs text-destructive">
                  {phoneError}
                </p>
              )}
              <Button onClick={handlePhoneLogin} disabled={isLoading || !phone} className="w-full">
                <Phone className="mr-2 h-4 w-4" />
                Send Verification Code
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="otp">Verification Code</Label>
              <Input
                id="otp"
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
              />
              {otpError && (
                <p className="text-xs text-destructive">
                  {otpError}
                </p>
              )}
              <Button onClick={handleOtpVerification} disabled={isLoading || otp.length !== 6} className="w-full">
                Verify Code
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
