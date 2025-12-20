import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import ProductCard from '@/components/product-card-new';
import { getProducts } from '@/lib/services/products';
import { formatDistanceToNow } from 'date-fns';
import { BadgeCheck, Phone } from 'lucide-react';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { arSA } from 'date-fns/locale';
import { getSellerProfileById } from '@/lib/services/sellers';

interface SellerPageProps {
  params: Promise<{ id: string }>;
}

export default async function SellerPage({ params }: SellerPageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const cookieStore = await cookies();
  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);
  const supabase = await createClient(cookieStore);
  const [{ data: { user } = { user: null } }, profile] = await Promise.all([
    supabase.auth.getUser(),
    getSellerProfileById(id),
  ]);

  if (!profile) {
    notFound();
  }

  const listings = await getProducts({ sellerId: id }, 24, 0);

  const formatRelativeTimeKurdish = (date: Date): string => {
    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const totalMinutes = Math.floor(diffMs / 60_000);
    const totalHours = Math.floor(diffMs / 3_600_000);
    const totalDays = Math.floor(diffMs / 86_400_000);

    const formatNumber = (value: number) => new Intl.NumberFormat('ku-u-nu-arab').format(value);

    if (totalMinutes < 60) {
      const minutes = Math.max(1, totalMinutes);
      return `${formatNumber(minutes)} خولەک`;
    }

    if (totalHours < 24) {
      const hours = Math.max(1, totalHours);
      return `${formatNumber(hours)} کاتژمێر`;
    }

    if (totalDays < 7) {
      const days = Math.max(1, totalDays);
      return `${formatNumber(days)} ڕۆژ`;
    }

    if (totalDays < 30) {
      const weeks = Math.max(1, Math.floor(totalDays / 7));
      return `${formatNumber(weeks)} هەفتە`;
    }

    if (totalDays < 365) {
      const months = Math.max(1, Math.floor(totalDays / 30));
      return `${formatNumber(months)} مانگ`;
    }

    const years = Math.max(1, Math.floor(totalDays / 365));
    return `${formatNumber(years)} ساڵ`;
  };

  const joined = profile.created_at
    ? locale === 'ar'
      ? formatDistanceToNow(new Date(profile.created_at), { locale: arSA, addSuffix: false })
      : locale === 'ku'
        ? formatRelativeTimeKurdish(new Date(profile.created_at))
        : formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })
    : null;

  const getCityLabel = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const cityKey =
      normalized === 'all cities' ? 'all' : normalized === 'cities' ? 'all' : normalized;
    const lookupKey = `header.city.${cityKey}`;
    const translated = t(lookupKey);
    return translated === lookupKey ? value : translated;
  };

  const phoneDir =
    typeof profile.phone === 'string' && /[\u0660-\u0669\u06F0-\u06F9]/.test(profile.phone)
      ? 'rtl'
      : 'ltr';

  const ratingLabel = profile.rating ?? t('product.ratingNA');
  const reviewsCount = profile.total_ratings ?? 0;
  const reviewsLabel = t('product.reviewsLabel');
  const listingsCountLabel =
    locale === 'en'
      ? `${listings.length} ${listings.length === 1 ? t('sellerPage.itemSingle') : t('sellerPage.itemPlural')}`
      : t('sellerPage.itemsCount').replace('{count}', String(listings.length));

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback>{(profile.full_name ?? 'U').charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div>
                <h1 dir="auto" className="flex items-center gap-2 text-2xl font-bold bidi-auto">
                  <span>{profile.full_name ?? t('product.sellerFallback')}</span>
                  {profile.is_verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <BadgeCheck className="h-4 w-4" />
                      <span className="sr-only">{t('profile.overview.trustedBadge')}</span>
                    </span>
                  ) : null}
                </h1>
                {profile.phone && (
                  <div dir={phoneDir} className="inline-flex items-center gap-1 text-sm text-muted-foreground bidi-auto">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {joined && (
                  <p className="text-sm text-muted-foreground">
                    {t('sellerPage.memberSince').replace('{time}', joined)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {profile.location && (
                  <span>
                    {locale === 'ar' || locale === 'ku'
                      ? getCityLabel(profile.location)
                      : `${t('product.basedInPrefix')} ${getCityLabel(profile.location)}`}
                  </span>
                )}
                <span>
                  {t('sellerPage.ratingLabel')}: {ratingLabel} ({reviewsCount} {reviewsLabel})
                </span>
              </div>
              {profile.bio && <p className="max-w-2xl text-sm text-muted-foreground">{profile.bio}</p>}
            </div>
          </CardContent>
        </Card>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t('profile.tabs.listings')}</h2>
            <span className="text-sm text-muted-foreground">{listingsCountLabel}</span>
          </div>
          {listings.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                {t('sellerPage.noListings')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {listings.map((listing) => (
                <ProductCard key={listing.id} product={listing} viewerId={user?.id ?? null} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
