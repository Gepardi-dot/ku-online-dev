import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import ProductCard from '@/components/product-card-new';
import { getProducts } from '@/lib/services/products';
import { differenceInMonths } from 'date-fns';
import { BadgeCheck, Clock, MapPin, Phone, Star } from 'lucide-react';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
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

  const joined = (() => {
    if (!profile.created_at) {
      return null;
    }

    const months = Math.max(1, differenceInMonths(new Date(), new Date(profile.created_at)));
    const numberLocale = locale === 'ar' || locale === 'ku' ? `${locale}-u-nu-arab` : locale;
    const count = new Intl.NumberFormat(numberLocale).format(months);
    const unit = t(`product.monthUnit.${months === 1 ? 'one' : 'other'}`);
    return `${count} ${unit}`;
  })();

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
        {/* Profile Header Card with Glassmorphism */}
        <Card className="mb-8 rounded-[28px] border border-white/60 bg-gradient-to-br from-white/80 via-white/70 to-white/50 shadow-[0_12px_40px_rgba(15,23,42,0.15)] ring-1 ring-white/40 overflow-hidden">
          {/* Subtle gradient banner */}
          <div className="h-20 bg-gradient-to-r from-orange-100 via-amber-50 to-orange-100" />
          <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-start -mt-12">
            {/* Avatar with ring effect */}
            <Avatar className="h-24 w-24 border-4 border-white shadow-lg ring-4 ring-brand/20">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="bg-gradient-to-br from-brand to-brand-dark text-white text-2xl font-bold">
                {(profile.full_name ?? 'U').charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-3 flex-1">
              <div>
                <h1 dir="auto" className="flex items-center gap-2 text-2xl font-bold text-[#2D2D2D] bidi-auto">
                  <span>{profile.full_name ?? t('product.sellerFallback')}</span>
                  {profile.is_verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                      <BadgeCheck className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('profile.overview.trustedBadge')}</span>
                    </span>
                  ) : null}
                </h1>
              </div>
              {/* Info badges with distinct colors */}
              <div className="flex flex-wrap gap-2">
                {profile.phone && (
                  <span
                    dir={phoneDir}
                    className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 shadow-sm bidi-auto"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{profile.phone}</span>
                  </span>
                )}
                {joined && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm">
                    <Clock className="h-3.5 w-3.5" />
                    {t('sellerPage.memberSince').replace('{time}', joined)}
                  </span>
                )}
                {profile.location && (
                  <span
                    dir="auto"
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm bidi-auto"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {locale === 'ar' || locale === 'ku'
                      ? getCityLabel(profile.location)
                      : `${getCityLabel(profile.location)}`}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span>{ratingLabel}</span>
                  <span className="text-amber-600/70">
                    ({reviewsCount} {reviewsLabel})
                  </span>
                </span>
              </div>
              {/* Bio with styled background */}
              {profile.bio && (
                <p className="max-w-2xl rounded-xl bg-orange-50/60 px-4 py-3 text-sm text-orange-900/80 leading-relaxed">
                  {profile.bio}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Listings Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-brand">{t('profile.tabs.listings')}</h2>
            <span className="text-sm font-medium text-muted-foreground bg-white/60 px-3 py-1 rounded-full">{listingsCountLabel}</span>
          </div>
          {listings.length === 0 ? (
            <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/40">
              <CardContent className="p-8 text-center text-muted-foreground">
                {t('sellerPage.noListings')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
