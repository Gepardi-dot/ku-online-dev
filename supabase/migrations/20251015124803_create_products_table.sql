create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text,
  price numeric,
  created_at timestamp default now()
);;
