
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Star, Package, MessageCircle, Settings, Edit } from 'lucide-react';
import ProductCard from '@/components/product-card-new';
import { getProducts } from '@/lib/services/products';
import { formatDistanceToNow } from 'date-fns';

type ProfilePageSearchParams = {
  tab?: string;
};

const ALLOWED_TABS = new Set(['listings', 'reviews', 'messages', 'settings']);

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: ProfilePageSearchParams;
}) {
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
      'full_name, avatar_url, phone, location, bio, rating, total_ratings, created_at, response_rate, is_verified',
    )
    .eq('id', user.id)
    .maybeSingle();

  const listings = await getProducts({ sellerId: user.id }, 24, 0);

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
  };

  const joinedLabel = profileData.joinedDate
    ? formatDistanceToNow(new Date(profileData.joinedDate), { addSuffix: true })
    : null;

  const requestedTab = searchParams?.tab ?? 'listings';
  const activeTab = ALLOWED_TABS.has(requestedTab ?? '')
    ? (requestedTab as string)
    : 'listings';

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
                        <Star className="h-3 w-3 text-yellow-500" />
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
                    <Button className="w-full">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                    <Button variant="outline" className="w-full">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Tabs defaultValue={activeTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
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
                          <ProductCard key={listing.id} product={listing} />
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
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Email</label>
                        <p className="text-sm text-muted-foreground">{profileData.email}</p>
                      </div>
                      {profileData.phone && (
                        <div>
                          <label className="text-sm font-medium">Phone</label>
                          <p className="text-sm text-muted-foreground">{profileData.phone}</p>
                        </div>
                      )}
                      <Button variant="outline" className="mt-4">
                        Update Contact Information
                      </Button>
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
