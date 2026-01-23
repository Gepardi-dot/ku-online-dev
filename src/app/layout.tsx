import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import AppFooter from '@/components/layout/footer';
import MobileNav from '@/components/layout/mobile-nav';
import { DM_Sans, Noto_Kufi_Arabic } from 'next/font/google';
import { LocaleProvider } from '@/providers/locale-provider';
import { getServerLocale } from '@/lib/locale/server';
import { rtlLocales } from '@/lib/locale/dictionary';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const notoKufiArabic = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: 'KU BAZAR - Your Global Online Shopping Destination',
  description: 'A multi-vendor local marketplace for the Kurdistan region.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/icon-128.png', sizes: '128x128', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-256.png', sizes: '256x256', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const direction = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const supabaseOrigin = (() => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      return url ? new URL(url).origin : null;
    } catch {
      return null;
    }
  })();
  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <head>
        {supabaseOrigin ? (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="" />
        ) : null}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body
        className={cn(
          dmSans.className,
          dmSans.variable,
          notoKufiArabic.variable,
          'font-body antialiased min-h-screen bg-background font-sans pt-(--app-header-offset) pb-(--mobile-nav-offset) md:pb-0',
        )}
      >
        <LocaleProvider initialLocale={locale}>
          <AnnouncementBar />
          <div>{children}</div>
          <MobileNav />
          <AppFooter />
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
