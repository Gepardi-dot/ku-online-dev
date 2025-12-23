import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import AppFooter from '@/components/layout/footer';
import MobileNav from '@/components/layout/mobile-nav';
import { Noto_Kufi_Arabic, PT_Sans } from 'next/font/google';
import { LocaleProvider } from '@/providers/locale-provider';
import { getServerLocale } from '@/lib/locale/server';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

const notoKufiArabic = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: 'KU-ONLINE - Your Global Online Shopping Destination',
  description: 'A multi-vendor local marketplace for the Kurdistan region.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const supabaseOrigin = (() => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      return url ? new URL(url).origin : null;
    } catch {
      return null;
    }
  })();
  return (
    <html lang={locale} dir="ltr" suppressHydrationWarning>
      <head>
        {supabaseOrigin ? (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="" />
        ) : null}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body
        className={cn(
          ptSans.className,
          notoKufiArabic.variable,
          'font-body antialiased min-h-screen bg-background font-sans',
        )}
      >
        <LocaleProvider>
          <AnnouncementBar />
          <div className="pb-16 md:pb-0">{children}</div>
          <MobileNav />
          <AppFooter />
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
