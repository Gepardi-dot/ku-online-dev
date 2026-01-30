-- Update Sponsors category labels.
-- Data migration only.

update public.categories
set
  name = 'Stores and Sponsors',
  name_ar = 'المحلات والرعاة',
  name_ku = 'فرۆشگاکان و سپۆنسەرەکان',
  description = 'Store listings and sponsor partnerships.',
  icon = '/Sponsor.png.png',
  is_active = true,
  sort_order = 999
where id = '00000000-0000-0000-0000-00000000000d';
