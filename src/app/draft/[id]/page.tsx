import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
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
        />
      </div>
    </AppLayout>
  );
}
