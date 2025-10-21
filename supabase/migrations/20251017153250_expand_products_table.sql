alter table products
  rename column name to title;

alter table products
  add column if not exists description text,
  add column if not exists original_price numeric,
  add column if not exists currency text default 'IQD',
  add column if not exists condition text,
  add column if not exists category_id uuid references categories(id) on delete set null,
  add column if not exists seller_id uuid references users(id) on delete cascade,
  add column if not exists location text,
  add column if not exists images text[] default '{}',
  add column if not exists is_active boolean default true,
  add column if not exists is_sold boolean default false,
  add column if not exists is_promoted boolean default false,
  add column if not exists views integer default 0,
  add column if not exists updated_at timestamptz default now();

alter table products
  alter column price set default 0,
  alter column price set not null,
  alter column created_at set default now();

alter table products
  add constraint products_price_non_negative check (price >= 0),
  add constraint products_original_price_non_negative check (original_price is null or original_price >= 0);

create index if not exists products_category_id_idx on products(category_id);
create index if not exists products_seller_id_idx on products(seller_id);
create index if not exists products_is_active_idx on products(is_active) where is_active;
create index if not exists products_created_at_idx on products(created_at desc);;
