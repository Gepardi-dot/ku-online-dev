import { cookies } from 'next/headers';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { getServerLocale } from '@/lib/locale/server';
import { translations } from '@/lib/locale/dictionary';
import { getMarketplaceFaq } from '@/lib/faq';

export default async function FaqPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const locale = await getServerLocale();
  const messages = translations[locale];
  const faq = getMarketplaceFaq(locale);

  return (
    <AppLayout user={user}>
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl md:text-3xl font-bold text-center mb-10">
            {messages.homepage.faqTitle}
          </h1>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {faq.map((item, index) => (
                <AccordionItem value={`faq-${index}`} key={item.question}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

