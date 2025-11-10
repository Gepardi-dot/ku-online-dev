-- Seed data for marketplace categories and demo user
insert into public.categories (id, name, description, sort_order)
values
    ('00000000-0000-0000-0000-000000000001', 'Electronics', 'Phones, laptops, and accessories', 1),
    ('00000000-0000-0000-0000-000000000002', 'Home & Garden', 'Furniture, kitchenware, and decor', 2),
    ('00000000-0000-0000-0000-000000000003', 'Fashion', 'Clothing, shoes, and accessories', 3),
    ('00000000-0000-0000-0000-000000000004', 'Sports', 'Sports gear and fitness equipment', 4),
    ('00000000-0000-0000-0000-000000000005', 'Kids & Toys', 'Toys, games, and children''s items', 5),
    ('00000000-0000-0000-0000-000000000006', 'Services', 'Professional and local services', 6),
    ('00000000-0000-0000-0000-000000000007', 'Motors', 'Cars, motorbikes, and parts', 7),
    ('00000000-0000-0000-0000-000000000008', 'Free', 'Items available for free', 8),
    ('00000000-0000-0000-0000-000000000009', 'Others', 'Miscellaneous categories', 9)\r\non conflict (id) do nothing;

insert into public.users (id, name, email, full_name, is_verified, response_rate, last_seen_at)
values (
    '00000000-0000-0000-0000-0000000000aa',
    'Demo Seller',
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
values (
    '00000000-0000-0000-0000-0000000000bb',
    'Sample Listing',
    'An example listing to verify the marketplace UI.',
    150000.00,
    'Used - Good',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000aa',
    '["https://placehold.co/600x400"]'::jsonb,
    true
)
on conflict (id) do nothing;


