import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function DisputesRefundsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Disputes & Refund Requests</h1>
          <p className="text-gray-700 mb-6">
            KU BAZAR is a listings marketplace. We do not own items, ship on your
            behalf, or control payments between buyers and sellers. Most issues are
            resolved directly between the two parties. If you cannot reach a
            resolution, you can escalate for a platform review as described below.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">When a refund may be appropriate</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Item not received after the agreed handover/dispatch date.</li>
            <li>Item significantly not as described in the listing.</li>
            <li>Counterfeit, prohibited, or recalled item.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Not covered</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Change of mind or sizing/fit preferences.</li>
            <li>Normal wear and tear that was disclosed in the listing.</li>
            <li>Damage occurring after successful handover/delivery.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">How to request a refund (buyers)</h2>
          <ol className="list-decimal pl-6 space-y-2 text-gray-700">
            <li>Message the seller in KU BAZAR within 48 hours of receipt/handover.</li>
            <li>Provide photos/videos and a short description of the issue.</li>
            <li>
              If unresolved, select <em>Report an issue</em> on the listing or message
              thread within 72 hours.
            </li>
          </ol>

          <h2 className="text-xl font-semibold mt-8 mb-3">Seller responsibilities</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Respond within 48 hours of a buyer message.</li>
            <li>Offer a resolution: return for full refund, partial refund, or exchange.</li>
            <li>For returns, issue the refund after receiving the item back in the same condition.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Platform review</h2>
          <p className="text-gray-700 mb-3">
            When escalated, KU BAZAR may review the listing, message history, and
            evidence submitted. We may remove listings or take account actions for
            policy violations. We do not move money or force refunds between parties.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Evidence tips</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Keep all communication on KU BAZAR messages.</li>
            <li>Save receipts and any tracking information.</li>
            <li>Photograph the package on arrival and record unboxing for condition disputes.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Chargebacks</h2>
          <p className="text-gray-700">
            If a bank or wallet dispute is raised, we share available records with the
            payment provider. Their decision may take precedence over any ongoing case.
          </p>

          <p className="text-gray-500 mt-8">
            Typical timelines: seller reply within 48 hours; KU BAZAR review within
            3 business days after receiving complete evidence.
          </p>
        </div>
      </section>
    </AppLayout>
  );
}


