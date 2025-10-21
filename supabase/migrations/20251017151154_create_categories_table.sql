create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  name_ku text,
  description text,
  icon text,
  is_active boolean default true,
  sort_order integer,
  created_at timestamptz default now()
);

create unique index if not exists categories_name_key on categories(lower(name));;
