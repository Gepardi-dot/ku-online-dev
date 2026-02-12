-- Add "Our Sponsors" as a non-product category entry.
-- Note: This is a data migration (no schema changes).

insert into public.categories (
  id,
  name,
  name_ar,
  name_ku,
  description,
  icon,
  is_active,
  sort_order
)
values (
  '00000000-0000-0000-0000-00000000000d',
  'Our Sponsors',
  'رعاتنا',
  'سپۆنسەرەکانمان',
  'Brand partnerships and sponsors',
  '/Sponsor.png.png',
  true,
  999
)
on conflict (id) do update
set
  name = excluded.name,
  name_ar = excluded.name_ar,
  name_ku = excluded.name_ku,
  description = excluded.description,
  icon = excluded.icon,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

