-- Allow verified sellers to post more listings per day.
set search_path = public;

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
  max_per_day integer;
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

  select case when coalesce(u.is_verified, false) then 10 else 3 end
    into max_per_day
  from public.users u
  where u.id = seller;

  max_per_day := coalesce(max_per_day, 3);

  insert into public.seller_daily_listing_limits (seller_id, day, count, created_at, updated_at)
  values (seller, day_key, 1, now_utc, now_utc)
  on conflict (seller_id, day) do update
    set count = public.seller_daily_listing_limits.count + 1,
        updated_at = excluded.updated_at
    where public.seller_daily_listing_limits.count < max_per_day
  returning count into existing_count;

  if existing_count is null then
    raise exception using
      errcode = 'P0001',
      message = 'Daily listing limit reached',
      detail = 'ku_daily_listing_limit',
      hint = format('Max %s listings per day', max_per_day);
  end if;

  -- Prevent users from spoofing timestamps.
  new.created_at := now_utc;
  new.updated_at := now_utc;

  return new;
end;
$$;

revoke all on function public.trg_products_enforce_daily_limit() from public;

