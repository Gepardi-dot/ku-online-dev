import type { Metadata, Viewport } from 'next';
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
import PwaBootstrap from '@/components/pwa/pwa-bootstrap';
import PwaInstallBanner from '@/components/pwa/pwa-install-banner';
import PwaPushBanner from '@/components/pwa/pwa-push-banner';
import PwaTelemetry from '@/components/pwa/pwa-telemetry';
import SessionPersistence from '@/components/auth/session-persistence';

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
  applicationName: 'KU BAZAR',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'KU BAZAR',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#f97316',
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
        <PwaTelemetry />
        <PwaBootstrap />
        <SessionPersistence />
        <LocaleProvider initialLocale={locale}>
          <AnnouncementBar />
          <div>{children}</div>
          <MobileNav />
          <PwaInstallBanner />
          <PwaPushBanner />
          <AppFooter />
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
