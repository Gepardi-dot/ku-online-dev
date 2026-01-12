import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function FeesPaymentsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Fees & Payments</h1>
          <p className="text-gray-700 mb-6">
            KU BAZAR is a peer‑to‑peer marketplace and does not currently offer
            escrow or hold funds between parties. Any delivery costs are agreed
            between buyer and seller.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Platform fees</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>No listing fee for standard postings (subject to change).</li>
            <li>Optional promotional fees (e.g., boost/highlight) may apply when enabled.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Payment methods</h2>
          <p className="text-gray-700 mb-3">
            Payment is arranged directly between buyer and seller. Choose trusted
            methods and keep a clear record of the transaction.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>For local meet‑ups, prefer payment on inspection.</li>
            <li>For remote deals, use providers that include buyer protections.</li>
            <li>Avoid sending deposits to unknown parties.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Invoices & receipts</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Keep screenshots of the listing and message agreement.</li>
            <li>Save courier receipts and tracking numbers when used.</li>
          </ul>
        </div>
      </section>
    </AppLayout>
  );
}


