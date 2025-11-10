import type { MetadataRoute } from 'next';
import { getCachedCategories } from '@/lib/services/products-cache';
import { getProducts } from '@/lib/services/products';
import { getPublicEnv } from '@/lib/env-public';

const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();
const SITE_URL = NEXT_PUBLIC_SITE_URL ?? 'https://ku-online.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/products`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  const [categories, recentProducts] = await Promise.all([
    getCachedCategories(),
    getProducts({}, 20, 0, 'newest'),
  ]);

  for (const category of categories) {
    entries.push({
      url: `${SITE_URL}/products?category=${encodeURIComponent(category.id)}`,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const product of recentProducts) {
    entries.push({
      url: `${SITE_URL}/product/${product.id}`,
      changeFrequency: 'weekly',
      priority: 0.8,
      lastModified: product.updatedAt ?? product.createdAt ?? undefined,
    });
  }

  return entries;
}
