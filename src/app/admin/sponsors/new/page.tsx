import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/utils/supabase/server';
import { isModerator } from '@/lib/auth/roles';
import NewStoreForm from './NewStoreForm';

export const dynamic = 'force-dynamic';

export default async function AdminNewSponsorStorePage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isModerator(user)) {
    redirect('/');
  }

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-xl">New sponsor store</CardTitle>
            <Button asChild variant="outline" className="rounded-full bg-white/80">
              <Link href="/admin/sponsors">Back</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <NewStoreForm />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

