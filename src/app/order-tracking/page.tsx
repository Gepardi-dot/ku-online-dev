import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function OrderTrackingPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Order Status & Tracking</h1>
          <p className="text-gray-700 mb-6">
            KU-ONLINE doesn’t generate shipping labels or manage carriers. Buyers and
            sellers share status updates and any tracking numbers in KU‑ONLINE
            messages.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Typical status flow</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Inquiry → Agreed Price → Pending Handover/Dispatch → Completed</li>
            <li>Sellers can post: “Sent with [Courier]” and include the tracking number.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Finding updates</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Open the message thread for the listing to view notes and updates.</li>
            <li>If a courier is used, track directly on the courier’s site/app.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">If you didn’t receive tracking</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Ask the seller via messages for the tracking number.</li>
            <li>If the seller is unresponsive for 48 hours after the agreed dispatch, use <em>Report an issue</em>.</li>
          </ul>
        </div>
      </section>
    </AppLayout>
  );
}

