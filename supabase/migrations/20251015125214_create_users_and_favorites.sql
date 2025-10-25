create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  created_at timestamp default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  product_id uuid references public.products(id),
  created_at timestamp default now()
);;
