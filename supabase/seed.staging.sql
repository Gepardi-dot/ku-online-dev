-- Staging-only demo data (DO NOT RUN ON PRODUCTION).
-- This file seeds demo product listings for UI testing.

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

