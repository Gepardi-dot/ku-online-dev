import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import AppLayout from '@/components/layout/app-layout';
import { createClient } from '@/utils/supabase/server';
import { getProductById } from '@/lib/services/products';
import EditProductForm from './EditProductForm';

type PageProps = {
  params: Promise<{ id: string }>; 
};

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const [userRes, product] = await Promise.all([
    supabase.auth.getUser(),
    getProductById(id),
  ]);

  const user = userRes.data.user;
  if (!user) {
    redirect(`/product/${id}`);
  }

  if (!product) notFound();
  if (product.sellerId !== user.id) {
    // Only owners can edit their listings
    redirect(`/product/${id}`);
  }

  const initial = {
    title: product.title,
    description: product.description ?? '',
    price: String(product.price ?? 0),
    currency: (product.currency === 'USD' ? 'USD' : 'IQD') as 'USD' | 'IQD',
    condition: product.condition ?? '',
    categoryId: product.categoryId ?? '',
    location: product.location ?? '',
    imagePaths: product.imagePaths ?? [],
    imageUrls: product.imageUrls ?? [],
  };

  return (
    <AppLayout user={user}>
      <div className="container mx-auto px-4 py-8">
        <EditProductForm productId={id} initial={initial} />
      </div>
    </AppLayout>
  );
}
