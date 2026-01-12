import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import SellForm from './sell-form';

export default async function SellPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <SellForm user={user} />
    </AppLayout>
  );
}
