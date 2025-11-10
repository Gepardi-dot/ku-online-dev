import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function SafetyFraudPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Safety & Fraud</h1>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Keep all chat and agreements on KU‑ONLINE messages.</li>
            <li>Never send deposits or prepayments to unknown parties.</li>
            <li>Meet in public, well‑lit places and inspect items before paying.</li>
            <li>For electronics, test basic functions during meet‑up.</li>
            <li>Report suspicious listings or behavior using the Report action.</li>
          </ul>
        </div>
      </section>
    </AppLayout>
  );
}

