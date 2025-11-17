-- Align products table with application expectations for color filters
alter table if exists public.products
  add column if not exists color_token text;
;

