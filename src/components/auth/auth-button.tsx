'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, LogOut, Phone, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';

import { getPublicEnv } from '@/lib/env-public';
import { useLocale } from '@/providers/locale-provider';
import { isModerator } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

interface AuthButtonProps {
  user: any;
}

export default function AuthButton({ user }: AuthButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t, locale } = useLocale();
  const isRtl = locale === 'ar' || locale === 'ku';
  const isKurdish = locale === 'ku';
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
        setPhoneError(t('auth.phoneRequiredError'));
        setIsLoading(false);
        return;
      }

      // Normalise international numbers like 0044... to +44...
      let normalized = raw;
      if (normalized.startsWith('00')) {
        normalized = `+${normalized.slice(2)}`;
      }

      // Basic E.164-style validation; Supabase/Twilio expect international format.
      if (!/^\+?[0-9]{7,15}$/.test(normalized)) {
        setPhoneError(t('auth.phoneInvalidError'));
        setIsLoading(false);
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
        setPhoneError(t('auth.sendVerificationFailed'));
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      setPhoneError(t('auth.sendVerificationFailed'));
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
        setOtpError(t('auth.verifyCodeFailed'));
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setOtpError(t('auth.verifyCodeFailed'));
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
          <Button
            variant="ghost"
            className="relative h-8 w-8 rounded-full transition active:scale-[0.98] data-[state=open]:scale-[1.03] data-[state=open]:shadow-[0_14px_32px_rgba(247,111,29,0.18)] data-[state=open]:ring-2 data-[state=open]:ring-brand/40"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.user_metadata?.avatar_url} alt={user.user_metadata?.full_name} />
              <AvatarFallback>
                {user.user_metadata?.full_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="z-[90] w-56 rounded-[32px] border border-white/60 bg-gradient-to-br from-white/30 via-white/20 to-white/5 !bg-transparent p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-[50px] ring-1 ring-white/40"
          align="end"
          sideOffset={10}
          forceMount
        >
          <div className="rounded-2xl bg-gradient-to-r from-brand/10 via-brand-light/10 to-brand/5 border border-brand/20 px-4 py-3 mb-3">
            <p className="text-sm font-semibold text-[#2D2D2D]">
              {user.user_metadata?.full_name || t('header.userMenu.defaultName')}
            </p>
            <p className="text-xs text-brand/80 mt-0.5">
              {user.email}
            </p>
          </div>
          <DropdownMenuItem asChild className="mb-2">
            <Link href="/profile?tab=overview" className="flex items-center rounded-2xl border border-transparent bg-white/50 shadow-sm ring-1 ring-black/[0.03] px-3 py-2 hover:bg-white/60 hover:border-[#eadbc5]/50">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              {t('header.userMenu.myProfile')}
            </Link>
          </DropdownMenuItem>
          {userIsModerator && (
            <DropdownMenuItem asChild className="mb-2">
              <Link href="/admin/moderation" className="flex items-center rounded-2xl border border-transparent bg-white/50 shadow-sm ring-1 ring-black/[0.03] px-3 py-2 hover:bg-white/60 hover:border-[#eadbc5]/50">
                <ShieldCheck className="mr-2 h-4 w-4" />
                {t('header.userMenu.moderation')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="mb-3">
            <Link href="/profile?tab=settings" className="flex items-center rounded-2xl border border-transparent bg-white/50 shadow-sm ring-1 ring-black/[0.03] px-3 py-2 hover:bg-white/60 hover:border-[#eadbc5]/50">
              <Settings className="mr-2 h-4 w-4" />
              {t('header.userMenu.settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout} className="rounded-2xl border border-transparent bg-white/50 shadow-sm ring-1 ring-black/[0.03] hover:bg-white/60 hover:border-[#eadbc5]/50 px-3 py-2">
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
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "transition active:scale-[0.98] data-[state=open]:scale-[1.02] data-[state=open]:shadow-[0_12px_28px_rgba(247,111,29,0.16)]",
            isRtl && "px-2 text-[12px]",
          )}
        >
          <User className="mr-2 h-4 w-4" />
          <span
            dir="auto"
            className={cn(
              "bidi-auto inline-block",
              isRtl && "max-w-[6.5rem] truncate text-[12px] leading-tight",
            )}
          >
            {t('header.signIn')}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle
            className={cn(
              "flex items-center gap-1",
              isKurdish && "flex-row-reverse",
              isRtl && "w-full justify-end text-right",
            )}
            dir={isKurdish ? "rtl" : undefined}
          >
            {isKurdish ? (
              <>
                <span className="text-primary text-[1.05em] font-semibold">
                  {t('auth.signInTitleBrand')}
                </span>
                <span>{t('auth.signInTitlePrefix')}</span>
              </>
            ) : (
              <>
                <span dir={isRtl ? "rtl" : undefined}>{t('auth.signInTitlePrefix')}</span>
                <span dir="ltr">KU-ONLINE</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className={cn("w-full gap-2", isRtl && "flex-row-reverse")}
          >
            <Icons.google className="h-5 w-5" />
            {t('auth.continueWithGoogle')}
          </Button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{t('auth.orLabel')}</span>
            </div>
          </div>

          {!showOtpInput ? (
            <div className="space-y-2">
              <Label htmlFor="phone">{t('auth.phoneLabel')}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder={t('auth.phonePlaceholder')}
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
                {t('auth.sendVerificationCode')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="otp">{t('auth.verificationCodeLabel')}</Label>
              <Input
                id="otp"
                type="text"
                placeholder={t('auth.verificationCodePlaceholder')}
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
                {t('auth.verifyCode')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
