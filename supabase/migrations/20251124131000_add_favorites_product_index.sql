-- Add index to speed up favorite counts per product
set search_path = public;

create index if not exists idx_favorites_product
  on public.favorites (product_id);
