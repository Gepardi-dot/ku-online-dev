import { cookies, headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageCircle, Store } from 'lucide-react';

import AppLayout from '@/components/layout/app-layout';
import { CurrencyText } from '@/components/currency-text';
import { Button } from '@/components/ui/button';
import { getServerLocale } from '@/lib/locale/server';
import { getMockProductById, getMockSponsorStoreBySlug } from '@/lib/services/sponsors-mock';
import { createClient } from '@/utils/supabase/server';

function toWhatsAppHref(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '').replace(/^00/, '+').trim();
  if (!digits) return null;
  const normalized = digits.startsWith('+') ? digits.slice(1) : digits;
  if (!normalized) return null;
  return `https://wa.me/${encodeURIComponent(normalized)}`;
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function toAbsoluteUrl(value: string | null | undefined, origin: string): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  return null;
}

export default async function SponsorMockProductPage({ params }: { params: Promise<{ productId: string }> }) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const { productId } = await params;
  const product = getMockProductById(productId);
  if (!product) {
    notFound();
  }

  const store = getMockSponsorStoreBySlug(product.storeSlug);
  if (!store) {
    notFound();
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getServerLocale();
  const waHref = toWhatsAppHref(store.whatsapp ?? store.phone ?? null);
  const imageSrc = product.imageUrl?.trim() || '/icon-512.png';
  const headerStore = await headers();
  const forwardedHost = headerStore.get('x-forwarded-host')?.split(',')[0]?.trim() ?? null;
  const host = forwardedHost || headerStore.get('host');
  const forwardedProto = headerStore.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? null;
  const protocol = forwardedProto || (host?.includes('localhost') ? 'http' : 'https');
  const requestOrigin = host ? `${protocol}://${host}` : null;
  const origin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? normalizeOrigin(requestOrigin) ?? 'https://ku-online.vercel.app';
  const productLink = `${origin}/sponsors/products/${encodeURIComponent(product.id)}`;
  const imageLink = toAbsoluteUrl(imageSrc, origin);
  const whatsappMessage = [
    `Hi ${store.name}, I'm interested in this product:`,
    product.title,
    `Price: ${Math.round(product.price)} ${product.currency ?? 'IQD'}`,
    `Product link: ${productLink}`,
    imageLink ? `Image: ${imageLink}` : null,
    'From KU BAZAR',
  ]
    .filter(Boolean)
    .join('\n');
  const whatsappHref = waHref
    ? `${waHref}${waHref.includes('?') ? '&' : '?'}text=${encodeURIComponent(whatsappMessage)}`
    : '#';

  return (
    <AppLayout user={user}>
      <section className="pt-6 pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/sponsors/stores/${store.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-[#111827] ring-1 ring-black/10 hover:bg-white"
              >
                <Store className="h-4 w-4" aria-hidden="true" />
                <span dir="auto">{store.name}</span>
              </Link>
              <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-black/10">
                Mock Preview
              </span>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/50">
              <div className="grid gap-0 md:grid-cols-2">
                <div className="relative aspect-square bg-white">
                  <Image src={imageSrc} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority />
                </div>

                <div className="p-5 md:p-6">
                  <h1 className="text-2xl font-extrabold text-[#111827]" dir="auto">
                    {product.title}
                  </h1>

                  <div className="mt-3 flex flex-wrap items-end gap-2" dir="auto">
                    {typeof product.originalPrice === 'number' && product.originalPrice > product.price ? (
                      <span className="text-lg font-semibold text-[#DA291C] line-through decoration-1">
                        <CurrencyText amount={product.originalPrice} currencyCode={product.currency} locale={locale} />
                      </span>
                    ) : null}
                    <span className="text-3xl font-extrabold text-brand">
                      <CurrencyText amount={product.price} currencyCode={product.currency} locale={locale} />
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-muted-foreground" dir="auto">
                    {product.description ?? 'Mock product details for layout preview.'}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button asChild className="rounded-full bg-[#25D366] text-white hover:bg-[#1FB857]">
                      <Link
                        href={whatsappHref}
                        target={waHref ? '_blank' : undefined}
                        rel={waHref ? 'noreferrer' : undefined}
                        className={!waHref ? 'pointer-events-none opacity-60' : ''}
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        WhatsApp Store
                      </Link>
                    </Button>

                    <Button asChild variant="outline" className="rounded-full bg-white/80 hover:bg-white">
                      <Link href={`/sponsors/stores/${store.slug}`}>Back to store</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
