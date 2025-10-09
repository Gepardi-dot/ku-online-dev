import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import AppFooter from '@/components/layout/footer';
import MobileNav from '@/components/layout/mobile-nav';
import { PT_Sans } from 'next/font/google';
import { LocaleProvider } from '@/providers/locale-provider';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KU-ONLINE - Your Global Online Shopping Destination',
  description: 'A multi-vendor local marketplace for the Kurdistan region.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(ptSans.className, 'font-body antialiased min-h-screen bg-background font-sans')}>
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
