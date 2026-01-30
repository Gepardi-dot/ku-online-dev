-- Seed data for local/staging development.
-- Keep this file safe to run repeatedly and avoid inserting demo listings here.
-- For demo products, use supabase/seed.staging.sql (DO NOT run that on production).

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

