set search_path = public;

with seed (
  id,
  name,
  name_ar,
  name_ku,
  description,
  icon,
  is_active,
  sort_order
) as (
  values
    (
      '00000000-0000-0000-0000-000000000001'::uuid,
      'Smartphones and iPads',
      'الهواتف والأيباد',
      'مۆبایل و ئایپاد',
      'Phones and tablets',
      '/Smartphones and ipads.png',
      true,
      10
    ),
    (
      '00000000-0000-0000-0000-000000000002'::uuid,
      'Fashion',
      'أزياء',
      'فەشن',
      'Clothing, shoes, and accessories',
      '/Fashion (2) (1).png',
      true,
      20
    ),
    (
      '00000000-0000-0000-0000-000000000003'::uuid,
      'Electronics',
      'إلكترونيات',
      'ئێلێکترۆنیات',
      'Electronics and gadgets',
      '/Electronics (1).png',
      true,
      30
    ),
    (
      '00000000-0000-0000-0000-000000000004'::uuid,
      'Sports',
      'رياضة',
      'وەرزشی',
      'Sports and outdoor gear',
      '/Sports (2) (1).png',
      true,
      40
    ),
    (
      '00000000-0000-0000-0000-000000000005'::uuid,
      'Home Appliance',
      'أجهزة منزلية',
      'کەرەساتی ناو ماڵ',
      'Home appliances and household goods',
      '/Home appliance.png',
      true,
      50
    ),
    (
      '00000000-0000-0000-0000-000000000006'::uuid,
      'Kids & Toys',
      'ألعاب الأطفال',
      'منداڵ و یاریەکان',
      'Kids products and toys',
      '/Kids & Toys (1).png',
      true,
      60
    ),
    (
      '00000000-0000-0000-0000-000000000007'::uuid,
      'Furniture',
      'أثاث',
      'کەلوپەلی ناو ماڵ',
      'Home and office furniture',
      '/Furniture (1).png',
      true,
      70
    ),
    (
      '00000000-0000-0000-0000-000000000008'::uuid,
      'Services',
      'خدمات',
      'خزمەتگوزاری',
      'Professional and personal services',
      '/Services (1).png',
      true,
      80
    ),
    (
      '00000000-0000-0000-0000-000000000009'::uuid,
      'Cars',
      'سيارات',
      'ئۆتۆمبێل',
      'Cars and vehicles',
      '/Cars (2) (1).png',
      true,
      90
    ),
    (
      '00000000-0000-0000-0000-00000000000a'::uuid,
      'Property',
      'عقارات',
      'خانوو',
      'Property and real estate',
      '/Property.png',
      true,
      100
    ),
    (
      '00000000-0000-0000-0000-00000000000b'::uuid,
      'Free',
      'مجاني',
      'بێبەرامبەر',
      'Free giveaway items',
      '/Free (2) (1).png',
      true,
      110
    ),
    (
      '00000000-0000-0000-0000-00000000000c'::uuid,
      'Others',
      'أخرى',
      'هیتر',
      'Other listings',
      '/Others (2) (1).png',
      true,
      120
    ),
    (
      '00000000-0000-0000-0000-00000000000d'::uuid,
      'Stores and Sponsors',
      'المحلات والرعاة',
      'فرۆشگاکان و سپۆنسەرەکان',
      'Brand partnerships and sponsors',
      '/Sponsor.png.png',
      true,
      999
    )
)
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
select
  seed.id,
  seed.name,
  seed.name_ar,
  seed.name_ku,
  seed.description,
  seed.icon,
  seed.is_active,
  seed.sort_order
from seed
on conflict (id) do update
set
  name = excluded.name,
  name_ar = excluded.name_ar,
  name_ku = excluded.name_ku,
  description = excluded.description,
  icon = excluded.icon,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
