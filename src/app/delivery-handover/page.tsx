import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function DeliveryHandoverPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Delivery & Handover</h1>
          <p className="text-gray-700 mb-6">
            KU-ONLINE does not ship items or generate shipping labels. Buyers and
            sellers coordinate delivery or local meet‑ups directly in messages.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Available options</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Local meet‑up in a public, well‑lit location.</li>
            <li>Seller‑arranged courier service.</li>
            <li>Buyer‑arranged pickup or third‑party courier.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Agree details in messages</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Date and time of handover or dispatch.</li>
            <li>Exact location or chosen courier and service level.</li>
            <li>Who pays delivery fees and what counts as successful handover.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Meet‑up tips</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Choose busy public spots; bring only the agreed amount.</li>
            <li>Inspect the item fully before paying.</li>
            <li>Avoid sharing unnecessary personal information.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Courier tips</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Ask for photos of packed items and keep the tracking number.</li>
            <li>Confirm the delivery address in KU-ONLINE messages.</li>
            <li>Risk of loss/damage follows your agreement with the courier.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Prohibited shipments</h2>
          <p className="text-gray-700">
            Do not ship hazardous materials, weapons, perishable goods without proper
            packaging, or any items banned by our policies or the courier.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">If delivery is late or missing</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Contact the courier first using the tracking number.</li>
            <li>If there’s no tracking, message the seller for an update.</li>
            <li>Use <em>Report an issue</em> if you can’t resolve it together.</li>
          </ul>
        </div>
      </section>
    </AppLayout>
  );
}

