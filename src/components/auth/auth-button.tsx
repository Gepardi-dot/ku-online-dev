'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, LogOut, Phone, Mail, Settings, LayoutDashboard } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { getPublicEnv } from '@/lib/env-public';

interface AuthButtonProps {
  user: any;
}

export default function AuthButton({ user }: AuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const supabase = createClient();
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      // Prefer configured site URL (dev: http://localhost:5000). Fallback to window origin.
      let origin = NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');
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
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
      });
      if (!error) {
        setShowOtpInput(true);
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
    }
    setIsLoading(false);
  };

  const handleOtpVerification = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      if (!error) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    window.location.reload();
  };

  if (user) {
    return (
      <DropdownMenu>
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
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuItem className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.user_metadata?.full_name || 'User'}
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
              My Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/profile?tab=settings" className="flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              Edit Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
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
          Sign In
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
