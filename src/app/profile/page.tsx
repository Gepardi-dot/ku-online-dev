
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { differenceInMonths, formatDistanceToNow } from 'date-fns';
import { ar, ckb, enUS } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EditProfileButton from '@/components/profile/EditProfileButton';
import AppLayout from '@/components/layout/app-layout';
import { CurrencyText } from '@/components/currency-text';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  BadgeCheck,
  Bell,
  BellRing,
  Clock,
  Edit,
  Eye,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  Settings,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { createTransformedSignedUrls } from '@/lib/storage';
import { buildPublicStorageUrl, deriveThumbPath } from '@/lib/storage-public';
import ProductCard from '@/components/product-card-new';
import { getProducts } from '@/lib/services/products';
import ProfileSettingsForm from './profile-settings-form';
import AccountSettingsPanel from './account-settings-panel';
import type { UpdateProfileFormValues } from './form-state';
import { getServerLocale, serverTranslate } from '@/lib/locale/server';
import { localizeText } from '@/lib/locale/localize';
import { rtlLocales } from '@/lib/locale/dictionary';
import { MARKET_CITY_OPTIONS } from '@/data/market-cities';
type ProfilePageSearchParams = {
  tab?: string;
};

const ALLOWED_TABS = new Set([
  'overview',
  'listings',
  'sales',
  'profile',
  'settings',
]);

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  buyer: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

type SoldListingRow = {
  id: string;
  title: string | null;
  title_translations?: Record<string, unknown> | null;
  price: number | string | null;
  currency: string | null;
  images: string[] | null;
  location: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type InsightTileProps = {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
};

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeTranslationMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function InsightTile({ icon, label, value, helper }: InsightTileProps) {
  return (
    <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 p-4 shadow-[0_8px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/40">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
          {icon}
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-[#2D2D2D]">{value}</p>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<ProfilePageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const locale = await getServerLocale();
  const t = (key: string) => serverTranslate(locale, key);
  const isRtl = rtlLocales.includes(locale);
  const dateFnsLocale = locale === 'ar' ? ar : locale === 'ku' ? ckb : enUS;
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  type UserProfileRow = {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    location: string | null;
    bio: string | null;
    rating: number | null;
    total_ratings: number | null;
    created_at: string | null;
    response_rate: string | null;
    is_verified: boolean | null;
    profile_completed: boolean | null;
    notify_messages: boolean | null;
    notify_offers: boolean | null;
    notify_updates: boolean | null;
    notify_announcements: boolean | null;
    marketing_emails: boolean | null;
    preferred_language: string | null;
  };

  const { data: profileRow } = await supabase
    .from('users')
    .select(
      [
        'full_name',
        'avatar_url',
        'phone',
        'location',
        'bio',
        'rating',
        'total_ratings',
        'created_at',
        'response_rate',
        'is_verified',
        'profile_completed',
        'notify_messages',
        'notify_offers',
        'notify_updates',
        'notify_announcements',
        'marketing_emails',
        'preferred_language',
      ].join(', '),
    )
    .eq('id', user.id)
    .maybeSingle<UserProfileRow>();

  const listings = await getProducts(
    { sellerId: user.id, includeInactive: true, includeSold: true },
    24,
    0,
  );
  const activeListings = listings.filter((listing) => listing.isActive && !listing.isSold);
  const activeListingIds = activeListings.map((listing) => listing.id);

  let watchersCount = 0;
  if (activeListingIds.length > 0) {
    const { count, error: favoritesError } = await supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .in(
        'product_id',
        activeListingIds,
      );

    if (favoritesError) {
      console.error('Failed to load favorites summary', favoritesError);
    } else {
      watchersCount = count ?? 0;
    }
  }

  const { data: recentReviews, error: reviewsError } = await supabase
    .from('reviews')
    .select(
      'id, rating, comment, created_at, buyer:buyer_id(full_name, avatar_url)',
    )
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3);

  if (reviewsError) {
    console.error('Failed to load recent reviews', reviewsError);
  }

  const { data: soldRows, error: soldError } = await supabase
    .from('products')
    .select(
      'id, title, title_translations, price, currency, images, location, updated_at, created_at',
    )
    .eq('seller_id', user.id)
    .eq('is_sold', true)
    .order('updated_at', { ascending: false });

  if (soldError) {
    console.error('Failed to load sold listings', soldError);
  }

  type SaleRow = {
    product_id: string;
    buyer_id: string | null;
    sold_at: string | null;
    buyer: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  };

  type SaleBuyerRow = NonNullable<SaleRow['buyer']>;
  type SaleRowRaw = Omit<SaleRow, 'buyer'> & { buyer: SaleBuyerRow[] | SaleBuyerRow | null };

  const salesByProductId = new Map<string, SaleRow>();
  const soldIds = (soldRows ?? [])
    .map((row) => String((row as SoldListingRow)?.id ?? ''))
    .filter((value) => value.length > 0);

  if (soldIds.length > 0) {
    const { data: saleRows, error: saleError } = await supabase
      .from('product_sales')
      .select(
        'product_id, buyer_id, sold_at, buyer:public_user_profiles!product_sales_buyer_id_fkey(id, full_name, avatar_url)',
      )
      .in('product_id', soldIds);

    if (saleError) {
      const message = (saleError as { message?: string }).message ?? '';
      const code = (saleError as { code?: string }).code ?? '';
      const isMissingRelation = code === '42P01' || message.includes('product_sales') || message.includes('relationship');
      if (!isMissingRelation) {
        console.error('Failed to load sold buyer details', saleError);
      }
    } else {
      for (const row of (saleRows ?? []) as unknown as SaleRowRaw[]) {
        if (!row?.product_id) continue;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] ?? null : row.buyer ?? null;
        salesByProductId.set(String(row.product_id), {
          product_id: String(row.product_id),
          buyer_id: row.buyer_id ? String(row.buyer_id) : null,
          sold_at: row.sold_at ? String(row.sold_at) : null,
          buyer,
        });
      }
    }
  }

  const profileData = {
    fullName: profileRow?.full_name ?? user.user_metadata?.full_name ?? 'User',
    avatar: profileRow?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
    email: user.email ?? 'Not set',
    phone: profileRow?.phone ?? user.user_metadata?.phone ?? null,
    location: profileRow?.location ?? user.user_metadata?.location ?? 'Kurdistan',
    bio:
      profileRow?.bio ??
      (typeof user.user_metadata?.bio === 'string' ? (user.user_metadata.bio as string) : null),
    rating: profileRow?.rating ? Number(profileRow.rating) : null,
    totalRatings: profileRow?.total_ratings ? Number(profileRow.total_ratings) : 0,
    joinedDate: profileRow?.created_at ?? user.created_at ?? null,
    responseRate: profileRow?.response_rate ?? '--',
    isVerified: Boolean(profileRow?.is_verified),
    profileCompleted: Boolean(profileRow?.profile_completed),
    notifyMessages: profileRow?.notify_messages ?? true,
    notifyOffers: profileRow?.notify_offers ?? true,
    notifyUpdates: profileRow?.notify_updates ?? true,
    notifyAnnouncements: profileRow?.notify_announcements ?? false,
    marketingEmails: profileRow?.marketing_emails ?? false,
    preferredLanguage: (profileRow?.preferred_language as 'en' | 'ar' | 'ku' | null) ?? 'en',
  };

  const settingsInitialValues: UpdateProfileFormValues = {
    fullName: profileRow?.full_name ?? user.user_metadata?.full_name ?? profileData.fullName,
    avatarUrl: profileRow?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
    phone: profileRow?.phone ?? user.user_metadata?.phone ?? null,
    location: profileRow?.location ?? user.user_metadata?.location ?? null,
    bio: profileRow?.bio ?? null,
    notifyMessages: profileData.notifyMessages,
    notifyOffers: profileData.notifyOffers,
    notifyUpdates: profileData.notifyUpdates,
    notifyAnnouncements: profileData.notifyAnnouncements,
    marketingEmails: profileData.marketingEmails,
    preferredLanguage: profileData.preferredLanguage,
  };

  // Attempt to serve a short-lived transformed avatar URL for reliable loading
  let avatarDisplayUrl: string | null = profileData.avatar;
  try {
    if (avatarDisplayUrl && avatarDisplayUrl.includes('/storage/v1/object/public/')) {
      const idx = avatarDisplayUrl.indexOf('/storage/v1/object/public/');
      const after = avatarDisplayUrl.substring(idx + '/storage/v1/object/public/'.length);
      const firstSlash = after.indexOf('/');
      if (firstSlash > 0) {
        const path = after.substring(firstSlash + 1); // remove bucket name prefix
        const signed = await createTransformedSignedUrls([path], { width: 128, resize: 'cover', quality: 85, format: 'webp' });
        avatarDisplayUrl = signed[path] ?? avatarDisplayUrl;
      }
    }
  } catch (e) {
    // best-effort; keep original URL
  }

  // Visibility settings removed per product requirements.

  const joinedLabel = (() => {
    if (!profileData.joinedDate) {
      return null;
    }

    const joinedDate = new Date(profileData.joinedDate);
    if (Number.isNaN(joinedDate.getTime())) {
      return null;
    }

    const months = Math.max(1, differenceInMonths(new Date(), joinedDate));
    const numberLocale = locale === 'ar' || locale === 'ku' ? `${locale}-u-nu-arab` : locale;
    const count = new Intl.NumberFormat(numberLocale).format(months);
    const unit = t(`product.monthUnit.${months === 1 ? 'one' : 'other'}`);
    return `${count} ${unit}`;
  })();

  const requestedTab = params.tab ?? 'overview';
  const activeTab = ALLOWED_TABS.has(requestedTab ?? '')
    ? (requestedTab as string)
    : 'overview';

  const completionChecks = [
    Boolean(profileData.fullName),
    Boolean(profileData.avatar),
    Boolean(profileData.location),
    Boolean(profileData.phone),
    Boolean(profileRow?.bio),
    profileData.isVerified,
  ];
  const completionScore = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
  );

  const totalViews = activeListings.reduce((acc, item) => acc + (item.views ?? 0), 0);
  const featuredListingsSource = activeListings.length > 0 ? activeListings : listings;
  const featuredListings = featuredListingsSource.slice(0, 3);
  const cityLabels = MARKET_CITY_OPTIONS.reduce<Record<string, string>>((acc, option) => {
    const key = option.value.toLowerCase();
    acc[key] = t(`header.city.${key}`);
    return acc;
  }, {});
  const getCityLabel = (value: string | null | undefined) => {
    if (!value) return value ?? '';
    const normalized = value.trim().toLowerCase();
    return cityLabels[normalized] ?? value;
  };

  const reviews: ReviewRow[] = (recentReviews ?? []).map((row: any) => {
    const buyer = Array.isArray(row?.buyer)
      ? (row.buyer[0] ?? null)
      : row?.buyer ?? null;
    return {
      id: String(row.id),
      rating: Number(row.rating),
      comment: (row.comment as string) ?? null,
      created_at: String(row.created_at),
      buyer: buyer
        ? {
            full_name: (buyer.full_name as string) ?? null,
            avatar_url: (buyer.avatar_url as string) ?? null,
          }
        : null,
    };
  });

  const phoneDir =
    typeof profileData.phone === 'string' && /[\u0660-\u0669\u06F0-\u06F9]/.test(profileData.phone)
      ? 'rtl'
      : 'ltr';

  const sales = ((soldRows ?? []) as SoldListingRow[]).map((row) => {
    const sale = row?.id ? salesByProductId.get(String(row.id)) ?? null : null;
    const buyer = Array.isArray(sale?.buyer) ? (sale?.buyer[0] ?? null) : sale?.buyer ?? null;
    const images = normalizeImages(row?.images);
    const primaryImage = images[0] ?? null;
    const thumbPath = deriveThumbPath(primaryImage) ?? primaryImage;
    const imageUrl = buildPublicStorageUrl(thumbPath);
    const soldAtRaw = sale?.sold_at ?? row?.updated_at ?? row?.created_at ?? null;
    const soldAt = soldAtRaw ? new Date(soldAtRaw) : null;
    const titleTranslations = normalizeTranslationMap(row?.title_translations);
    const soldAtLabel =
      soldAt && !Number.isNaN(soldAt.getTime())
        ? formatDistanceToNow(soldAt, { addSuffix: true, locale: dateFnsLocale })
        : null;

    return {
      id: String(row?.id ?? ''),
      title: localizeText((row?.title as string) ?? '', titleTranslations, locale),
      price: row?.price ?? null,
      currency: row?.currency ?? null,
      location: row?.location ?? null,
      imageUrl,
      buyer: buyer
        ? {
            id: String(buyer.id),
            fullName: (buyer.full_name as string | null) ?? null,
            avatarUrl: (buyer.avatar_url as string | null) ?? null,
          }
        : null,
      soldAtLabel,
    };
  });

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-6" dir={isRtl ? 'rtl' : undefined}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
              <CardContent className="p-6">
                <div className="space-y-4 text-center">
                  <Avatar className="h-24 w-24 mx-auto">
                    <AvatarImage src={avatarDisplayUrl ?? undefined} />
                    <AvatarFallback className="text-2xl">
                      {profileData.fullName[0]}
                    </AvatarFallback>
                  </Avatar>

                  <div dir="auto" className="flex items-center justify-center gap-2 bidi-auto">
                    <h1 className="text-2xl font-bold max-w-[260px] truncate">{profileData.fullName}</h1>
                    {profileData.isVerified ? (
                      <>
                        <BadgeCheck className="h-5 w-5 text-emerald-600" />
                        <span className="sr-only">{t('profile.overview.trustedBadge')}</span>
                      </>
                    ) : null}
                  </div>

                  {profileData.phone ? (
                    <div
                      dir={phoneDir}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 bidi-auto"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      <span>{profileData.phone}</span>
                    </div>
                  ) : null}

                  {(Number(profileData.rating) > 0 || profileData.totalRatings > 0) && (
                    <div className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold">
                        {Number(profileData.rating ?? 0).toFixed(1)} / 5
                      </span>
                      <span>· {profileData.totalRatings} {t('product.reviewsLabel')}</span>
                    </div>
                  )}

                  <div className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sm text-sky-700">
                    <MapPin className="h-4 w-4" />
                    {getCityLabel(profileData.location)}
                  </div>

                  {joinedLabel ? (
                    <p dir="auto" className="inline-flex items-center justify-center gap-1 rounded-full bg-violet-50 px-3 py-1.5 text-xs text-violet-700 bidi-auto">
                      <Clock className="h-3.5 w-3.5" />
                      {t('product.memberSincePrefix')} {joinedLabel}
                    </p>
                  ) : null}

                  {profileData.bio ? (
                    <p dir="auto" className="rounded-xl bg-orange-50/80 px-3 py-2 text-sm text-orange-900/80 bidi-auto">
                      {profileData.bio}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-3 gap-4 border-t border-b border-[#eadbc5]/50 py-4">
                    <div className="text-center">
                      <div className="font-bold text-lg text-brand">{listings.length}</div>
                      <div className="text-xs text-muted-foreground">{t('profile.overview.statsListings')}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg text-brand">{profileData.totalRatings}</div>
                      <div className="text-xs text-muted-foreground">{t('profile.overview.statsReviews')}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg text-brand">{profileData.responseRate}</div>
                      <div className="text-xs text-muted-foreground">{t('profile.overview.statsResponse')}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <EditProfileButton className="w-full rounded-xl bg-brand hover:bg-brand-dark shadow-md" />
                    <Button asChild variant="outline" className="w-full rounded-xl border-[#eadbc5]/70 hover:bg-white/70">
                      <Link href="/profile?tab=settings">
                        <Settings className="mr-2 h-4 w-4" />
                        {t('profile.tabs.settings')}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Tabs key={activeTab} defaultValue={activeTab} className="space-y-6 -mt-3 sm:-mt-5">
              <TabsList className="mb-3 grid h-auto w-full grid-cols-3 items-center gap-1 rounded-full border border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.85),rgba(255,255,255,0.35)),radial-gradient(circle_at_top_left,rgba(255,214,170,0.35),transparent_60%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.6),transparent_50%),repeating-linear-gradient(90deg,rgba(255,255,255,0.12)_0,rgba(255,255,255,0.12)_2px,transparent_2px,transparent_6px)] p-1 shadow-[0_12px_30px_rgba(120,72,0,0.14)] backdrop-blur-xl ring-1 ring-white/60">
                <TabsTrigger
                  value="overview"
                  className="inline-flex w-full items-center justify-center gap-2 !rounded-full !px-3 !py-2 text-sm font-semibold text-[#7a5b46] transition-all hover:bg-white/60 hover:text-[#3b2a20] data-[state=active]:bg-white/75 data-[state=active]:text-[#2f221a] data-[state=active]:shadow-[0_10px_22px_rgba(120,72,0,0.18)] data-[state=active]:ring-1 data-[state=active]:ring-white/70 backdrop-blur-md [box-shadow:inset_0_1px_0_rgba(255,255,255,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white/30"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {t('profile.tabs.overview')}
                </TabsTrigger>
                <TabsTrigger
                  value="listings"
                  className="inline-flex w-full items-center justify-center gap-2 !rounded-full !px-3 !py-2 text-sm font-semibold text-[#7a5b46] transition-all hover:bg-white/60 hover:text-[#3b2a20] data-[state=active]:bg-white/75 data-[state=active]:text-[#2f221a] data-[state=active]:shadow-[0_10px_22px_rgba(120,72,0,0.18)] data-[state=active]:ring-1 data-[state=active]:ring-white/70 backdrop-blur-md [box-shadow:inset_0_1px_0_rgba(255,255,255,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white/30"
                >
                  <Package className="h-4 w-4" />
                  {t('profile.tabs.listings')}
                </TabsTrigger>
                <TabsTrigger
                  value="sales"
                  className="inline-flex w-full items-center justify-center gap-2 !rounded-full !px-3 !py-2 text-sm font-semibold text-[#7a5b46] transition-all hover:bg-white/60 hover:text-[#3b2a20] data-[state=active]:bg-white/75 data-[state=active]:text-[#2f221a] data-[state=active]:shadow-[0_10px_22px_rgba(120,72,0,0.18)] data-[state=active]:ring-1 data-[state=active]:ring-white/70 backdrop-blur-md [box-shadow:inset_0_1px_0_rgba(255,255,255,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white/30"
                >
                  <Receipt className="h-4 w-4" />
                  {t('profile.tabs.sales')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
                  <CardHeader>
                    <CardTitle className="text-brand">{t('profile.overview.performanceInsightsTitle')}</CardTitle>
                    <CardDescription>{t('profile.overview.performanceInsightsDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <InsightTile
                        icon={<Package className="h-5 w-5 text-primary" />}
                        label={t('profile.overview.metricActiveListings')}
                        value={activeListings.length.toLocaleString()}
                      />
                      <InsightTile
                        icon={<Eye className="h-5 w-5 text-primary" />}
                        label={t('profile.overview.metricTotalViews')}
                        value={totalViews.toLocaleString()}
                      />
                      <InsightTile
                        icon={<Star className="h-5 w-5 text-primary" />}
                        label={t('profile.overview.metricAverageRating')}
                        value={profileData.rating ? profileData.rating.toFixed(1) : '—'}
                        helper={
                          profileData.totalRatings
                            ? `${profileData.totalRatings} ${t('product.reviewsLabel')}`
                            : t('profile.overview.metricAverageRatingNoReviews')
                        }
                      />
                      <InsightTile
                        icon={<MessageCircle className="h-5 w-5 text-primary" />}
                        label={t('profile.overview.metricWatchers')}
                        value={watchersCount.toLocaleString()}
                        helper={t('profile.overview.metricWatchersHelper')}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
                  <CardHeader>
                    <CardTitle className="text-brand">{t('profile.overview.recentActivityTitle')}</CardTitle>
                    <CardDescription>{t('profile.overview.recentActivityDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground">
                          {t('profile.overview.latestListingsTitle')}
                        </h3>
                        <Link href="/profile?tab=listings" className="text-sm text-primary hover:underline">
                          {t('profile.overview.latestListingsCta')}
                        </Link>
                      </div>
                      {featuredListings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('profile.overview.latestListingsEmpty')}
                        </p>
                      ) : (
                        <div className="no-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 pb-2 snap-x snap-proximity md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
                          {featuredListings.map((listing) => (
                            <div key={listing.id} className="w-[220px] shrink-0 snap-start md:w-auto">
                              <ProductCard product={listing} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground">
                          {t('profile.overview.recentReviewsTitle')}
                        </h3>
                        <Link href="/profile?tab=profile" className="text-sm text-primary hover:underline">
                          {t('profile.overview.recentReviewsCta')}
                        </Link>
                      </div>
                      {reviews.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('profile.overview.recentReviewsEmpty')}
                        </p>
                      ) : (
                        <ul className="space-y-4">
                          {reviews.map((review) => (
                            <li key={review.id} className="flex gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={review.buyer?.avatar_url ?? undefined} />
                                <AvatarFallback>
                                  {review.buyer?.full_name?.[0] ?? '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {review.buyer?.full_name ?? t('profile.overview.reviewBuyerFallback')}
                                  </span>
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    {Number(review.rating).toFixed(1)}
                                  </Badge>
                                </div>
                                <p dir="auto" className="text-xs text-muted-foreground bidi-auto">
                                  {formatDistanceToNow(new Date(review.created_at), { addSuffix: true, locale: dateFnsLocale })}
                                </p>
                                {review.comment ? (
                                  <p className="text-sm text-muted-foreground">{review.comment}</p>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="listings" className="space-y-6">
                <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
                  <CardHeader>
                    <CardTitle className="text-brand">
                      {t('profile.listings.title')} ({listings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {listings.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('profile.listings.empty')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {listings.map((listing) => (
                          <ProductCard key={listing.id} product={listing} viewerId={user.id} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sales" className="space-y-6">
                <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
                  <CardHeader>
                    <CardTitle className="text-brand">
                      {t('profile.sales.title')} ({sales.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sales.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('profile.sales.empty')}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {sales.map((sale) => (
                          <div
                            key={sale.id}
                            className="flex flex-col gap-4 rounded-2xl border border-[#eadbc5]/60 bg-white/60 p-4 shadow-sm sm:flex-row"
                          >
                            <Link
                              href={`/product/${sale.id}`}
                              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-sm"
                            >
                              {sale.imageUrl ? (
                                <Image
                                  src={sale.imageUrl}
                                  alt={sale.title}
                                  fill
                                  sizes="96px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-white/70" aria-hidden="true" />
                              )}
                            </Link>
                            <div className="flex flex-1 flex-col gap-2">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <Link
                                    href={`/product/${sale.id}`}
                                    className="text-base font-semibold text-[#2D2D2D] hover:underline"
                                  >
                                    <span dir="auto" className="bidi-auto line-clamp-2">
                                      {sale.title}
                                    </span>
                                  </Link>
                                  <p className="text-sm font-medium text-brand">
                                    <CurrencyText
                                      amount={typeof sale.price === 'string' ? Number(sale.price) : sale.price}
                                      currencyCode={sale.currency}
                                      locale={locale}
                                    />
                                  </p>
                                </div>
                                <Badge variant="secondary" className="bg-gray-700 text-white">
                                  {t('product.soldBadge')}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                {sale.soldAtLabel ? (
                                  <span dir="auto" className="bidi-auto">
                                    {t('profile.sales.soldAtLabel')} {sale.soldAtLabel}
                                  </span>
                                ) : null}
                                {sale.location ? (
                                  <span dir="auto" className="bidi-auto">
                                    {getCityLabel(sale.location)}
                                  </span>
                                ) : null}
                              </div>
                              {sale.buyer ? (
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-muted-foreground">{t('profile.sales.buyerLabel')}:</span>
                                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-2.5 py-1 text-sm">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={sale.buyer.avatarUrl ?? undefined} />
                                      <AvatarFallback>
                                        {sale.buyer.fullName?.[0] ?? '?'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span dir="auto" className="bidi-auto">
                                      {sale.buyer.fullName ?? t('profile.sales.buyerFallback')}
                                    </span>
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="profile" className="space-y-6">
                <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
                  <CardHeader>
                    <CardTitle className="text-brand">{t('profile.form.heading')}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t('profile.form.description')}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <ProfileSettingsForm initialValues={settingsInitialValues} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/70 via-white/60 to-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-white/40">
                  <CardHeader>
                    <CardTitle className="text-brand">{t('profile.settingsPanel.heading')}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t('profile.settingsPanel.description')}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <AccountSettingsPanel initialValues={settingsInitialValues} currentEmail={profileData.email} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
