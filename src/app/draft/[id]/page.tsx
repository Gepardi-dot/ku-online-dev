import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient as createSupabaseServiceRole } from '@supabase/supabase-js';

import AppLayout from '@/components/layout/app-layout';
import { isModerator } from '@/lib/auth/roles';
import { getEnv } from '@/lib/env';
import { canAccessCollabDraft, canPublishCollabDraft } from '@/lib/products/collab-draft';
import { getProductById } from '@/lib/services/products';
import { createClient } from '@/utils/supabase/server';
import EditProductForm from '@/app/product/[id]/edit/EditProductForm';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Private draft | KU BAZAR',
    robots: { index: false, follow: false },
  };
}

export default async function CollabDraftPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const [{ data: { user } }, product] = await Promise.all([
    supabase.auth.getUser(),
    getProductById(id),
  ]);

  if (!user) {
    redirect(`/product/${id}`);
  }

  if (!product || !canAccessCollabDraft(user, product.sellerId)) {
    notFound();
  }

  if (product.isActive) {
    redirect(`/product/${id}`);
  }

  let storeName: string | null = null;
  if (isModerator(user)) {
    const env = getEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createSupabaseServiceRole(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await admin
        .from('products')
        .select('store:sponsor_stores!products_sponsor_store_id_fkey(name)')
        .eq('id', id)
        .maybeSingle();
      const store = data?.store as { name?: string | null } | { name?: string | null }[] | null | undefined;
      const storeRow = Array.isArray(store) ? store[0] : store;
      storeName = storeRow?.name?.trim() || null;
    }
  }

  const initial = {
    title: product.title,
    description: product.description ?? '',
    price: String(product.price ?? 0),
    currency: (product.currency === 'USD' ? 'USD' : 'IQD') as 'USD' | 'IQD',
    condition: product.condition ?? '',
    listingType: product.listingType,
    rentalTerm: product.rentalTerm,
    categoryId: product.categoryId ?? '',
    categoryName: product.category?.name ?? null,
    location: product.location ?? '',
    imagePaths: product.imagePaths ?? [],
    imageUrls: product.imageUrls ?? [],
  };

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <EditProductForm
          productId={id}
          initial={initial}
          mode="draft"
          canPublish={canPublishCollabDraft(user)}
          sellerName={product.seller?.fullName || product.seller?.name || product.seller?.email || null}
          storeName={storeName}
        />
      </div>
    </AppLayout>
  );
}
