import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SponsorServicesManager, type SponsorServiceItem } from '@/components/sponsors/SponsorServicesManager';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { getPrototypeStoreBySlug, listPrototypeOffersByStoreId } from '@/lib/prototypes/sponsors';

export default async function PrototypeSponsorManageServicesPage() {
  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);

  const store = getPrototypeStoreBySlug('zain-phones');
  if (!store) {
    return (
      <section className="pb-14">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl">
            <Card className="rounded-[28px] border-white/60 bg-linear-to-br from-white/80 via-white/70 to-white/50 shadow-[0_12px_42px_rgba(15,23,42,0.10)] ring-1 ring-white/40">
              <CardHeader>
                <CardTitle>Prototype: Manage services</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Prototype store not found.</CardContent>
            </Card>
          </div>
        </div>
      </section>
    );
  }

  const prototypeOffers = listPrototypeOffersByStoreId(store.id).slice(0, 4);

  const seeded: SponsorServiceItem[] = prototypeOffers.map((offer) => ({
    id: offer.id,
    title: offer.title,
    description: offer.description ?? null,
    discountType: offer.discountType as SponsorServiceItem['discountType'],
    discountValue: offer.discountValue ?? null,
    currency: offer.currency ?? null,
    endAt: offer.endAt ? offer.endAt.toISOString() : null,
    status: offer.status,
  }));

  const extra: SponsorServiceItem = {
    id: 'mock-service-amount-1',
    title: '5000 IQD off screen repair',
    description: 'Walk-in customers only.',
    discountType: 'amount',
    discountValue: 5000,
    currency: 'IQD',
    endAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'paused',
  };

  const initialItems = [extra, ...seeded];

  const sponsoredLabel = t('sponsorsHub.sponsoredBadge');
  const endsLabel = (time: string) => t('sponsorsHub.endsIn').replace('{time}', time);

  return (
    <section className="pb-14">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-[36px] border border-white/60 bg-linear-to-br from-white/75 via-white/65 to-white/45 p-6 shadow-[0_18px_52px_rgba(15,23,42,0.12)] ring-1 ring-white/40 md:p-8">
            <h1 className="text-2xl font-bold text-[#2D2D2D] md:text-3xl" dir="auto">
              Seller: Manage services (Prototype)
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground" dir="auto">
              This page uses mock data. Create/edit/pause/delete services to feel the seller workflow. Nothing is saved.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full bg-white/80">
                <Link href="/prototypes">Back to showroom</Link>
              </Button>
              <Button asChild className="rounded-full">
                <Link href={`/prototypes/sponsors/stores/${store.slug}`}>Open store page</Link>
              </Button>
            </div>
          </div>

          <SponsorServicesManager
            mode="mock"
            store={{ id: store.id, name: store.name, slug: store.slug }}
            initialItems={initialItems}
            locale={locale}
            sponsoredLabel={sponsoredLabel}
            endsLabel={endsLabel}
          />
        </div>
      </div>
    </section>
  );
}
