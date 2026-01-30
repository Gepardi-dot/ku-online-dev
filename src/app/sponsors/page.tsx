import { cookies } from 'next/headers';
import Image from 'next/image';

import AppLayout from '@/components/layout/app-layout';
import { PartnershipInquiry } from '@/components/marketing/partnership-inquiry';
import { createClient } from '@/utils/supabase/server';
import { getServerLocale } from '@/lib/locale/server';
import { translations } from '@/lib/locale/dictionary';

export default async function SponsorsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getServerLocale();
  const messages = translations[locale];

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-2xl md:text-3xl font-bold">{messages.homepage.sponsors}</h1>
            <p className="mt-3 text-muted-foreground">{messages.partnership.subtitle}</p>
          </div>

          <div className="mt-10 flex flex-col items-center gap-8">
            <div className="relative h-28 w-28 overflow-hidden rounded-3xl bg-white shadow-sm">
              <Image src="/Sponsor.png.png" alt="" fill className="object-contain scale-[1.85] p-1.5" priority />
            </div>
            <PartnershipInquiry />
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
