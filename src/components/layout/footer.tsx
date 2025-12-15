'use client';

import Link from 'next/link';
import { Facebook, Twitter, Instagram, Youtube, Apple, Play } from 'lucide-react';

import { useLocale } from '@/providers/locale-provider';
import { toast } from '@/hooks/use-toast';

export default function AppFooter() {
  const { messages } = useLocale();
  const year = new Date().getFullYear();

  const handleComingSoon = () => {
    toast({
      title: messages.common.comingSoonTitle,
      description: messages.common.comingSoonDescription,
    });
  };

  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white font-semibold mb-4">{messages.footer.aboutTitle}</h3>
            <ul className="space-y-2">
              <li>
                <button type="button" onClick={handleComingSoon} className="hover:text-white transition">
                  {messages.footer.aboutLinks.aboutUs}
                </button>
              </li>
              <li>
                <button type="button" onClick={handleComingSoon} className="hover:text-white transition">
                  {messages.footer.aboutLinks.careers}
                </button>
              </li>
              <li>
                <button type="button" onClick={handleComingSoon} className="hover:text-white transition">
                  {messages.footer.aboutLinks.press}
                </button>
              </li>
              <li>
                <button type="button" onClick={handleComingSoon} className="hover:text-white transition">
                  {messages.footer.aboutLinks.blog}
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">
              {messages.footer.customerServiceTitle}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/faq" className="hover:text-white transition">
                  {messages.footer.customerServiceLinks.helpCenter}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-white transition">
                  {messages.footer.customerServiceLinks.contactUs}
                </Link>
              </li>
              <li>
                <Link href="/disputes-refunds" className="hover:text-white transition">
                  {messages.footer.customerServiceLinks.disputes}
                </Link>
              </li>
              <li>
                <Link href="/order-tracking" className="hover:text-white transition">
                  {messages.footer.customerServiceLinks.orderTracking}
                </Link>
              </li>
              <li>
                <Link href="/delivery-handover" className="hover:text-white transition">
                  {messages.footer.customerServiceLinks.delivery}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">
              {messages.footer.paymentSecurityTitle}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/safety-fraud" className="hover:text-white transition">
                  {messages.footer.paymentSecurityLinks.secureShopping}
                </Link>
              </li>
              <li>
                <Link href="/fees-payments" className="hover:text-white transition">
                  {messages.footer.paymentSecurityLinks.feesPayments}
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="hover:text-white transition">
                  {messages.footer.paymentSecurityLinks.privacyPolicy}
                </Link>
              </li>
              <li>
                <Link href="/terms-of-use" className="hover:text-white transition">
                  {messages.footer.paymentSecurityLinks.termsOfUse}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">{messages.footer.followUsTitle}</h3>
            <div className="flex space-x-4 mb-6">
              <button
                type="button"
                onClick={handleComingSoon}
                className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition"
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleComingSoon}
                className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition"
                aria-label="Twitter"
              >
                <Twitter className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleComingSoon}
                className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition"
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleComingSoon}
                className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition"
                aria-label="YouTube"
              >
                <Youtube className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <h3 className="text-white font-semibold mb-4">{messages.footer.downloadAppTitle}</h3>
            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onClick={handleComingSoon}
                className="bg-gray-800 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center hover:bg-primary transition"
              >
                <Play className="w-5 h-5 mr-2" aria-hidden="true" />
                {messages.footer.googlePlay}
              </button>
              <button
                type="button"
                onClick={handleComingSoon}
                className="bg-gray-800 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center hover:bg-primary transition"
              >
                <Apple className="w-5 h-5 mr-2" aria-hidden="true" />
                {messages.footer.appStore}
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 text-sm text-center">
          <p>
            {messages.footer.copyright.replace('{year}', String(year))}
          </p>
        </div>
      </div>
    </footer>
  );
}

