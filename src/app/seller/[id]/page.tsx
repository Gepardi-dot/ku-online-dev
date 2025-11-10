import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import ProductCard from '@/components/product-card-new';
import { getProducts } from '@/lib/services/products';
import { formatDistanceToNow } from 'date-fns';

interface SellerPageProps {
  params: Promise<{ id: string }>;
}

export default async function SellerPage({ params }: SellerPageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const [{ data: { user } = { user: null } }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('users')
      .select('id, full_name, avatar_url, location, rating, total_ratings, created_at, bio')
      .eq('id', id)
      .maybeSingle(),
  ]);

  if (!profile) {
    notFound();
  }

  const listings = await getProducts({ sellerId: id }, 24, 0);

  const joined = profile.created_at
    ? formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })
    : null;

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
                <h1 className="text-2xl font-bold">{profile.full_name ?? 'Seller'}</h1>
                {joined && <p className="text-sm text-muted-foreground">Member since {joined}</p>}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {profile.location && <span>Based in {profile.location}</span>}
                <span>
                  Rating: {profile.rating ?? 'N/A'} ({profile.total_ratings ?? 0} reviews)
                </span>
              </div>
              {profile.bio && <p className="max-w-2xl text-sm text-muted-foreground">{profile.bio}</p>}
            </div>
          </CardContent>
        </Card>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Listings</h2>
            <span className="text-sm text-muted-foreground">{listings.length} item(s)</span>
          </div>
          {listings.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No listings found for this seller.
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
