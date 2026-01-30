-- Seed data for marketplace categories and demo user
insert into public.categories (id, name, description, sort_order)
values
    ('00000000-0000-0000-0000-000000000001', 'Smartphones and iPads', 'Phones, tablets, and accessories', 1),
    ('00000000-0000-0000-0000-000000000002', 'Fashion', 'Clothing, shoes, and accessories', 2),
    ('00000000-0000-0000-0000-000000000003', 'Electronics', 'Computers, consoles, and more', 3),
    ('00000000-0000-0000-0000-000000000004', 'Sports', 'Sports gear and fitness equipment', 4),
    ('00000000-0000-0000-0000-000000000005', 'Home Appliance', 'Appliances, kitchenware, and home essentials', 5),
    ('00000000-0000-0000-0000-000000000006', 'Kids & Toys', 'Toys, games, and children''s items', 6),
    ('00000000-0000-0000-0000-000000000007', 'Furniture', 'Furniture and decor', 7),
    ('00000000-0000-0000-0000-000000000008', 'Services', 'Professional and local services', 8),
    ('00000000-0000-0000-0000-000000000009', 'Cars', 'Cars, motorbikes, and parts', 9),
    ('00000000-0000-0000-0000-00000000000a', 'Property', 'Houses, apartments, and land', 10),
    ('00000000-0000-0000-0000-00000000000b', 'Free', 'Items available for free', 11),
    ('00000000-0000-0000-0000-00000000000c', 'Others', 'Miscellaneous categories', 12)
on conflict (id) do nothing;

insert into public.categories (id, name, name_ar, name_ku, description, icon, sort_order, is_active)
values (
    '00000000-0000-0000-0000-00000000000d',
    'Our Sponsors',
    'رعاتنا',
    'سپۆنسەرەکانمان',
    'Brand partnerships and sponsors',
    '/Sponsor.png.png',
    999,
    true
)
on conflict (id) do nothing;

insert into public.users (id, email, full_name, is_verified, response_rate, last_seen_at)
values (
    '00000000-0000-0000-0000-0000000000aa',
    'demo@sellku.app',
    'Demo Seller',
    true,
    98.50,
    timezone('utc', now())
)
on conflict (id) do nothing;

-- Optional: set emoji icons when the column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'categories' and column_name = 'icon'
  ) then
    
    
    
    
    
    
    
    
    
    
  end if;
end $$;

insert into public.products (
    id,
    title,
    description,
    price,
    condition,
    category_id,
    seller_id,
    images,
    is_promoted
)
select
    -- Stable deterministic IDs: 0x0bb..0x0ec (50 rows), so rerunning seed is idempotent.
    ('00000000-0000-0000-0000-' || lpad(to_hex(187 + gs.i), 12, '0'))::uuid as id,
    case
      when gs.i = 0 then 'Sample Listing'
      else format('Demo Listing #%s', gs.i + 1)
    end as title,
    case
      when gs.i = 0 then 'An example listing to verify the marketplace UI.'
      else 'Seeded demo listing for staging/testing.'
    end as description,
    (25000 + (gs.i * 5000))::numeric(10,2) as price,
    (array['New', 'Used - Like New', 'Used - Good', 'Used - Fair'])[(gs.i % 4) + 1] as condition,
    (array[
      '00000000-0000-0000-0000-000000000001'::uuid, -- Smartphones and iPads
      '00000000-0000-0000-0000-000000000002'::uuid, -- Fashion
      '00000000-0000-0000-0000-000000000003'::uuid, -- Electronics
      '00000000-0000-0000-0000-000000000004'::uuid, -- Sports
      '00000000-0000-0000-0000-000000000005'::uuid, -- Home Appliance
      '00000000-0000-0000-0000-000000000006'::uuid, -- Kids & Toys
      '00000000-0000-0000-0000-000000000007'::uuid, -- Furniture
      '00000000-0000-0000-0000-000000000008'::uuid, -- Services
      '00000000-0000-0000-0000-000000000009'::uuid, -- Cars
      '00000000-0000-0000-0000-00000000000a'::uuid, -- Property
      '00000000-0000-0000-0000-00000000000b'::uuid, -- Free
      '00000000-0000-0000-0000-00000000000c'::uuid  -- Others
    ])[(gs.i % 12) + 1] as category_id,
    '00000000-0000-0000-0000-0000000000aa'::uuid as seller_id,
    '["https://placehold.co/600x400"]'::jsonb as images,
    (gs.i = 0) as is_promoted
from generate_series(0, 49) as gs(i)
on conflict (id) do nothing;


