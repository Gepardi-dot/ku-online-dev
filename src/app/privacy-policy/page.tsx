import { cookies } from 'next/headers';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';

export default async function PrivacyPolicyPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
          <p className="text-gray-700 mb-4">
            This page describes how KU‑ONLINE handles personal information when you
            use our marketplace. It summarizes common practices and may be updated
            as our product evolves.
          </p>
          <h2 className="text-xl font-semibold mt-8 mb-3">Data we collect</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Account details you provide (name, email, and profile info).</li>
            <li>Listing content, messages, and activity on KU‑ONLINE.</li>
            <li>Technical data such as IP address, device, and cookies to keep you signed in and secure the service.</li>
          </ul>
          <h2 className="text-xl font-semibold mt-8 mb-3">How we use data</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Operate and improve the marketplace features.</li>
            <li>Prevent fraud and enforce our policies.</li>
            <li>Communicate about your account, listings, and safety notices.</li>
          </ul>
          <h2 className="text-xl font-semibold mt-8 mb-3">Sharing</h2>
          <p className="text-gray-700">
            We share data with service providers that help run KU‑ONLINE (for
            example, cloud hosting and analytics) under appropriate safeguards, and
            with authorities when required by law.
          </p>
          <h2 className="text-xl font-semibold mt-8 mb-3">Your controls</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Update your profile and listings at any time.</li>
            <li>Request account deletion via your account settings or support.</li>
            <li>Manage cookie settings in your browser.</li>
          </ul>
          <p className="text-gray-500 mt-8">
            This summary is provided for convenience and does not replace a
            full legal policy. We may revise it as features change.
          </p>
        </div>
      </section>
    </AppLayout>
  );
}

