-- Limit product creation to prevent listing spam.
set search_path = public;

-- Track per-seller listing creations by local day (Asia/Baghdad) so deletes can't bypass the limit.
create table if not exists public.seller_daily_listing_limits (
  seller_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint seller_daily_listing_limits_pkey primary key (seller_id, day),
  constraint seller_daily_listing_limits_count_non_negative check (count >= 0)
);

alter table public.seller_daily_listing_limits enable row level security;
revoke all on table public.seller_daily_listing_limits from public;

create or replace function public.trg_products_enforce_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller uuid;
  actor uuid;
  role_name text;
  existing_count integer;
  now_utc timestamptz;
  day_key date;
begin
  actor := auth.uid();
  role_name := auth.role();

  -- Allow inserts from trusted server contexts (migrations, service role).
  if actor is null or role_name in ('service_role', 'supabase_admin') then
    return new;
  end if;

  seller := new.seller_id;
  if seller is null then
    raise exception using
      errcode = 'P0001',
      message = 'Seller is required',
      detail = 'ku_products_missing_seller';
  end if;

  if seller <> actor then
    raise exception using
      errcode = 'P0001',
      message = 'Seller mismatch',
      detail = 'ku_products_seller_mismatch';
  end if;

  now_utc := timezone('utc', now());
  day_key := (timezone('Asia/Baghdad', now_utc))::date;

  insert into public.seller_daily_listing_limits (seller_id, day, count, created_at, updated_at)
  values (seller, day_key, 1, now_utc, now_utc)
  on conflict (seller_id, day) do update
    set count = public.seller_daily_listing_limits.count + 1,
        updated_at = excluded.updated_at
    where public.seller_daily_listing_limits.count < 3
  returning count into existing_count;

  if existing_count is null then
    raise exception using
      errcode = 'P0001',
      message = 'Daily listing limit reached',
      detail = 'ku_daily_listing_limit',
      hint = 'Max 3 listings per day';
  end if;

  -- Prevent users from spoofing timestamps.
  new.created_at := now_utc;
  new.updated_at := now_utc;

  return new;
end;
$$;

revoke all on function public.trg_products_enforce_daily_limit() from public;

drop trigger if exists trg_products_enforce_daily_limit on public.products;
create trigger trg_products_enforce_daily_limit
  before insert on public.products
  for each row
  execute procedure public.trg_products_enforce_daily_limit();

create or replace function public.trg_products_created_at_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  role_name text;
begin
  actor := auth.uid();
  role_name := auth.role();

  -- Allow updates from trusted server contexts (migrations, service role).
  if actor is null or role_name in ('service_role', 'supabase_admin') then
    return new;
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception using
      errcode = 'P0001',
      message = 'created_at is immutable',
      detail = 'ku_products_created_at_immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.trg_products_created_at_immutable() from public;

drop trigger if exists trg_products_created_at_immutable on public.products;
create trigger trg_products_created_at_immutable
  before update on public.products
  for each row
  execute procedure public.trg_products_created_at_immutable();

create index if not exists idx_products_seller_created_at
  on public.products (seller_id, created_at desc);
