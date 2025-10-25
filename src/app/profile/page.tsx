
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/components/layout/app-layout';
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
  Globe,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Package,
  Settings,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import ProductCard from '@/components/product-card-new';
import { getProducts } from '@/lib/services/products';
import ProfileSettingsForm from './profile-settings-form';
import type { UpdateProfileFormValues } from './form-state';

type ProfilePageSearchParams = {
  tab?: string;
};

const ALLOWED_TABS = new Set([
  'overview',
  'listings',
  'reviews',
  'messages',
  'settings',
]);

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  ku: 'Kurdish',
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Public',
  community: 'Community only',
  private: 'Private',
};

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

type InsightTileProps = {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
};

function InsightTile({ icon, label, value, helper }: InsightTileProps) {
  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
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
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

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
        'preferred_language',
        'profile_visibility',
        'show_profile_on_marketplace',
        'notify_messages',
        'notify_offers',
        'notify_updates',
        'marketing_emails',
      ].join(', '),
    )
    .eq('id', user.id)
    .maybeSingle();

  const listings = await getProducts({ sellerId: user.id }, 24, 0);

  let watchersCount = 0;
  if (listings.length > 0) {
    const { count, error: favoritesError } = await supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .in(
        'product_id',
        listings.map((listing) => listing.id),
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

  const profileData = {
    fullName: profileRow?.full_name ?? user.user_metadata?.full_name ?? 'User',
    avatar: profileRow?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
    email: user.email,
    phone: profileRow?.phone ?? user.user_metadata?.phone ?? null,
    location: profileRow?.location ?? user.user_metadata?.location ?? 'Kurdistan',
    bio:
      profileRow?.bio ??
      'Selling quality items at great prices. Fast shipping and excellent customer service.',
    rating: profileRow?.rating ? Number(profileRow.rating) : null,
    totalRatings: profileRow?.total_ratings ? Number(profileRow.total_ratings) : 0,
    joinedDate: profileRow?.created_at ?? user.created_at ?? null,
    responseRate: profileRow?.response_rate ?? '--',
    isVerified: Boolean(profileRow?.is_verified),
    profileCompleted: Boolean(profileRow?.profile_completed),
    preferredLanguage: profileRow?.preferred_language ?? 'en',
    profileVisibility: profileRow?.profile_visibility ?? 'public',
    showProfileOnMarketplace:
      profileRow?.show_profile_on_marketplace ?? true,
    notifyMessages: profileRow?.notify_messages ?? true,
    notifyOffers: profileRow?.notify_offers ?? true,
    notifyUpdates: profileRow?.notify_updates ?? true,
    marketingEmails: profileRow?.marketing_emails ?? false,
  };

  const settingsInitialValues: UpdateProfileFormValues = {
    fullName: profileRow?.full_name ?? user.user_metadata?.full_name ?? profileData.fullName,
    phone: profileRow?.phone ?? user.user_metadata?.phone ?? null,
    location: profileRow?.location ?? user.user_metadata?.location ?? null,
    bio: profileRow?.bio ?? null,
    preferredLanguage: profileData.preferredLanguage,
    profileVisibility: profileData.profileVisibility,
    showProfileOnMarketplace: profileData.showProfileOnMarketplace,
    notifyMessages: profileData.notifyMessages,
    notifyOffers: profileData.notifyOffers,
    notifyUpdates: profileData.notifyUpdates,
    marketingEmails: profileData.marketingEmails,
  };

  const joinedLabel = profileData.joinedDate
    ? formatDistanceToNow(new Date(profileData.joinedDate), { addSuffix: true })
    : null;

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

  const totalViews = listings.reduce((acc, item) => acc + (item.views ?? 0), 0);
  const featuredListings = listings.slice(0, 3);

  const languageLabel = LANGUAGE_LABELS[profileData.preferredLanguage] ?? 'English';
  const visibilityLabel =
    VISIBILITY_LABELS[profileData.profileVisibility] ?? 'Public';
  const reviews = (recentReviews ?? []) as ReviewRow[];

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <Avatar className="h-24 w-24 mx-auto">
                    <AvatarImage src={profileData.avatar ?? undefined} />
                    <AvatarFallback className="text-2xl">
                      {profileData.fullName[0]}
                    </AvatarFallback>
                  </Avatar>

                  {profileData.isVerified && (
                    <div className="flex justify-center">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                        Verified Seller
                      </Badge>
                    </div>
                  )}

                  <div>
                    <h1 className="text-2xl font-bold">{profileData.fullName}</h1>
                    {(profileData.rating || profileData.totalRatings) && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">
                          {(profileData.rating ?? 0).toFixed(1)}
                        </span>
                        <span className="text-muted-foreground">
                          ({profileData.totalRatings} reviews)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {profileData.location}
                  </div>

                  {joinedLabel && (
                    <p className="text-xs text-muted-foreground">Member since {joinedLabel}</p>
                  )}

                  <p className="text-sm text-muted-foreground">{profileData.bio}</p>

                  <div className="grid grid-cols-3 gap-4 py-4 border-t border-b">
                    <div className="text-center">
                      <div className="font-bold text-lg">{listings.length}</div>
                      <div className="text-xs text-muted-foreground">Listings</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">{profileData.totalRatings}</div>
                      <div className="text-xs text-muted-foreground">Reviews</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">{profileData.responseRate}</div>
                      <div className="text-xs text-muted-foreground">Response</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button asChild className="w-full">
                      <Link href="/profile?tab=settings#profile-details">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Profile
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/profile?tab=settings">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account preferences</CardTitle>
                <CardDescription>Current visibility and notification defaults.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Profile visibility</p>
                    <p className="text-muted-foreground">{visibilityLabel}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <LayoutDashboard className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Marketplace listing</p>
                    <p className="text-muted-foreground">
                      {profileData.showProfileOnMarketplace
                        ? 'Profile is discoverable in marketplace searches.'
                        : 'Profile is hidden from public directories.'}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Notifications</p>
                    <ul className="mt-1 space-y-1 text-muted-foreground">
                      <li>
                        {profileData.notifyMessages ? '✓' : '•'} Message alerts
                      </li>
                      <li>
                        {profileData.notifyOffers ? '✓' : '•'} Offer activity
                      </li>
                      <li>
                        {profileData.notifyUpdates ? '✓' : '•'} Listing updates
                      </li>
                      <li>
                        {profileData.marketingEmails ? '✓' : '•'} Marketing emails
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Preferred language</p>
                    <p className="text-muted-foreground">{languageLabel}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Tabs defaultValue={activeTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                <TabsTrigger value="overview">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="listings">
                  <Package className="mr-2 h-4 w-4" />
                  Listings
                </TabsTrigger>
                <TabsTrigger value="reviews">
                  <Star className="mr-2 h-4 w-4" />
                  Reviews
                </TabsTrigger>
                <TabsTrigger value="messages">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Messages
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Seller snapshot</CardTitle>
                    <CardDescription>
                      A consolidated view of how buyers experience your store.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-16 w-16">
                            <AvatarImage src={profileData.avatar ?? undefined} />
                            <AvatarFallback>{profileData.fullName[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-lg font-semibold">{profileData.fullName}</p>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {profileData.location}
                              </span>
                              {profileData.isVerified ? (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <BadgeCheck className="h-4 w-4" /> Verified
                                </span>
                              ) : null}
                              {joinedLabel ? <span>Joined {joinedLabel}</span> : null}
                            </div>
                          </div>
                        </div>

                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {profileData.bio}
                        </p>

                        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                          <div>
                            <dt className="font-medium text-muted-foreground">Contact</dt>
                            <dd className="mt-1 space-y-1">
                              <p className="text-foreground">{profileData.email}</p>
                              <p className="text-muted-foreground">
                                {profileData.phone ?? 'Phone not provided'}
                              </p>
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-muted-foreground">Visibility</dt>
                            <dd className="mt-1 space-y-1">
                              <p className="text-foreground">{visibilityLabel}</p>
                              <p className="text-muted-foreground">
                                {profileData.showProfileOnMarketplace
                                  ? 'Your storefront appears in marketplace directories.'
                                  : 'Hidden from marketplace discovery.'}
                              </p>
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-lg border bg-muted/40 p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-muted-foreground">
                              Profile completeness
                            </p>
                            <span className="text-sm font-semibold text-foreground">
                              {completionScore}%
                            </span>
                          </div>
                          <Progress value={completionScore} className="mt-2" />
                          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                            <li className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              Trusted seller badge
                            </li>
                            <li className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-500" />
                              Response rate: {profileData.responseRate}
                            </li>
                            <li className="flex items-center gap-2">
                              <BellRing className="h-4 w-4 text-amber-500" />
                              Notifications tuned for buyers
                            </li>
                          </ul>
                        </div>

                        <div className="rounded-lg border bg-background p-4 shadow-sm">
                          <p className="text-sm font-medium text-muted-foreground">Preferences</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <Globe className="h-4 w-4" /> Language
                              </span>
                              <span className="font-medium text-foreground">{languageLabel}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <Bell className="h-4 w-4" /> Marketing email opt-in
                              </span>
                              <span className="font-medium text-foreground">
                                {profileData.marketingEmails ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Performance insights</CardTitle>
                    <CardDescription>Monitor how your storefront is trending.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <InsightTile
                        icon={<Package className="h-5 w-5 text-primary" />}
                        label="Active listings"
                        value={listings.length.toLocaleString()}
                      />
                      <InsightTile
                        icon={<Eye className="h-5 w-5 text-primary" />}
                        label="Total views"
                        value={totalViews.toLocaleString()}
                      />
                      <InsightTile
                        icon={<Star className="h-5 w-5 text-primary" />}
                        label="Average rating"
                        value={profileData.rating ? profileData.rating.toFixed(1) : '—'}
                        helper={
                          profileData.totalRatings
                            ? `${profileData.totalRatings} reviews`
                            : 'Awaiting first review'
                        }
                      />
                      <InsightTile
                        icon={<MessageCircle className="h-5 w-5 text-primary" />}
                        label="Watchers"
                        value={watchersCount.toLocaleString()}
                        helper="Buyers keeping tabs on your listings"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent activity</CardTitle>
                    <CardDescription>What you have been sharing and what buyers are saying.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground">Latest listings</h3>
                        <Link href="/profile?tab=listings" className="text-sm text-primary hover:underline">
                          View all
                        </Link>
                      </div>
                      {featuredListings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Publish a listing to showcase it here.
                        </p>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {featuredListings.map((listing) => (
                            <ProductCard key={listing.id} product={listing} />
                          ))}
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground">Latest reviews</h3>
                        <Link href="/profile?tab=reviews" className="text-sm text-primary hover:underline">
                          See feedback
                        </Link>
                      </div>
                      {reviews.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Reviews will appear here after your first sale.
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
                                    {review.buyer?.full_name ?? 'Buyer'}
                                  </span>
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    {Number(review.rating).toFixed(1)}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
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
                <Card>
                  <CardHeader>
                    <CardTitle>My Listings ({listings.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {listings.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        You have not published any listings yet.
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

              <TabsContent value="reviews" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Reviews & Feedback</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      Reviews will appear here when buyers leave feedback.
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="messages" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Messages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      Your conversations will appear here.
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Settings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div>
                        <p className="text-sm font-medium">Account email</p>
                        <p className="text-sm text-muted-foreground">{profileData.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Email changes are managed through your authentication provider.
                        </p>
                      </div>
                      <ProfileSettingsForm initialValues={settingsInitialValues} />
                    </div>
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
