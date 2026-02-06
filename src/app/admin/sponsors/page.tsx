import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

type SponsorStoreRow = {
  id: string;
  name: string;
  slug: string;
  primary_city: string | null;
  status: string | null;
  sponsor_tier: string | null;
  is_featured: boolean | null;
  updated_at: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  const variant = normalized === 'active' ? 'default' : normalized === 'disabled' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{normalized}</Badge>;
}

export default async function AdminSponsorsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  const { data, error } = await supabase
    .from('sponsor_stores')
    .select('id,name,slug,primary_city,status,sponsor_tier,is_featured,updated_at')
    .order('updated_at', { ascending: false })
    .limit(250);

  if (error) {
    console.error('Failed to load sponsor stores (admin)', error);
  }

  const rows = (data ?? []) as unknown as SponsorStoreRow[];

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-xl">Sponsor stores</CardTitle>
            <Button asChild className="rounded-full">
              <Link href="/admin/sponsors/new">New store</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sponsor stores yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{store.name}</span>
                          <span className="text-xs text-muted-foreground">/{store.slug}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{store.primary_city ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge status={store.status ?? 'pending'} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{store.sponsor_tier ?? 'basic'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{store.is_featured ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" className="rounded-full bg-white/80">
                          <Link href={`/admin/sponsors/stores/${store.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

