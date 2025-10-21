
import { Suspense } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import ProductCard from '@/components/product-card-new';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getProducts, getCategories } from '@/lib/services/products';
import { NewsletterSignup } from '@/components/marketing/newsletter-signup';
import { getServerLocale } from '@/lib/locale/server';
import { LocaleMessages, translations } from '@/lib/locale/dictionary';

interface SearchPageProps {
  searchParams: Promise<{
    category?: string;
    condition?: string;
    location?: string;
    search?: string;
  }>;
}

interface ProductsListProps extends SearchPageProps {
  messages: LocaleMessages;
}

async function ProductsList({ searchParams, messages }: ProductsListProps) {
  const params = await searchParams;

  const [products, categories] = await Promise.all([
    getProducts({
      category: params.category,
      condition: params.condition,
      location: params.location,
      search: params.search,
    }),
    getCategories(),
  ]);

  return (
    <>
      <section className="py-4 bg-white border-b">
        <div className="container mx-auto px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">
              {messages.homepage.categoriesLabel}
            </h3>
            <Link
              href="/products"
              className="text-sm font-medium text-primary hover:underline"
            >
              {messages.homepage.viewAll}
            </Link>
          </div>

          {categories.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {messages.homepage.noCategories}
            </span>
          ) : (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => (
                <Link
                  href={`/?category=${category.id}`}
                  key={category.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-transparent bg-white px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary"
                >
                  <span className="text-base leading-none">
                    {category.icon ?? '🛍️'}
                  </span>
                  <span className="whitespace-nowrap">{category.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="products" className="pt-6 pb-12 bg-accent">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl md:text-3xl font-bold">
              {messages.homepage.latest}
            </h2>
            <Button asChild variant="link" className="text-primary font-semibold">
              <Link href="/products">
                {messages.homepage.viewAll}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {products.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {messages.homepage.noProducts}
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default async function MarketplacePage({ searchParams }: SearchPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getServerLocale();
  const messages = translations[locale];

  return (
    <AppLayout user={user}>
      <div className="flex flex-col">
        <Suspense
          fallback={
            <div className="container mx-auto px-4 py-12 text-center">
              {messages.common.loading}
            </div>
          }
        >
          <ProductsList searchParams={searchParams} messages={messages} />
        </Suspense>

        <section className="py-12 bg-gray-50">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
              {messages.homepage.faqTitle}
            </h2>
            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="w-full">
                {messages.homepage.faq.map((item, index) => (
                  <AccordionItem value={`faq-${index}`} key={item.question}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent>{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        <section className="py-12 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              {messages.homepage.subscribeTitle}
            </h2>
            <p className="mb-6 max-w-2xl mx-auto opacity-90">
              {messages.homepage.subscribeDescription}
            </p>
            <NewsletterSignup />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
