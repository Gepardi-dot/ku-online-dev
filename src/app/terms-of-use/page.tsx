import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function TermsOfUsePage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Terms of Use</h1>
          <p className="text-gray-700 mb-4">
            By using KU‑ONLINE you agree to these terms. KU‑ONLINE provides a
            platform where users list, buy, and sell items. We are not a party to
            transactions between users.
          </p>
          <h2 className="text-xl font-semibold mt-8 mb-3">User responsibilities</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Provide accurate information in listings and profiles.</li>
            <li>Comply with our policies and applicable laws.</li>
            <li>Transact safely and keep records of your agreements.</li>
          </ul>
          <h2 className="text-xl font-semibold mt-8 mb-3">Prohibited activities</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Selling illegal, counterfeit, or recalled goods.</li>
            <li>Fraud, spam, or abuse of other users.</li>
            <li>Bypassing safety features or interfering with the service.</li>
          </ul>
          <h2 className="text-xl font-semibold mt-8 mb-3">Content and listings</h2>
          <p className="text-gray-700">
            You are responsible for the content you post. KU‑ONLINE may remove
            content or restrict accounts that violate policies or the law.
          </p>
          <h2 className="text-xl font-semibold mt-8 mb-3">Limitation of liability</h2>
          <p className="text-gray-700">
            To the extent permitted by law, KU‑ONLINE is not liable for losses
            arising from transactions between users. The service is provided on an
            “as‑is” basis.
          </p>
          <p className="text-gray-500 mt-8">
            We may update these terms as features evolve. Continued use of the
            service after changes constitutes acceptance of the updated terms.
          </p>
        </div>
      </section>
    </AppLayout>
  );
}

