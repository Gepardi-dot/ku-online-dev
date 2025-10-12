-- Seed data for marketplace categories and demo user
insert into public.categories (id, name, description, sort_order)
values
    ('00000000-0000-0000-0000-000000000001', 'Electronics', 'Phones, laptops, and accessories', 1),
    ('00000000-0000-0000-0000-000000000002', 'Home & Living', 'Furniture, kitchenware, and decor', 2),
    ('00000000-0000-0000-0000-000000000003', 'Fashion', 'Clothing, shoes, and accessories', 3)
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
