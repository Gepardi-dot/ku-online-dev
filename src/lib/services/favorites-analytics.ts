import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = getEnv();

const supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function getProductFavoriteCount(productId: string): Promise<number> {
  if (!productId) {
    return 0;
  }

  const { count, error } = await supabaseAdmin
    .from('favorites')
    .select('id', { head: true, count: 'exact' })
    .eq('product_id', productId);

  if (error) {
    console.error('Failed to count favorites for product', productId, error);
    return 0;
  }

  return count ?? 0;
}

