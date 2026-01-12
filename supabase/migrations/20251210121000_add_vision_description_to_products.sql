-- Optional metadata for image-based search.
alter table public.products
  add column if not exists vision_description text;

