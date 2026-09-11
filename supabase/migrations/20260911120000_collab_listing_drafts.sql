-- Shared listing drafts: seller + staff can edit unpublished rows; only staff/service role can publish.
set search_path = public;

create or replace function public.jwt_app_role()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select lower(coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    ''
  ));
$$;

create or replace function public.is_marketplace_staff()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.jwt_app_role() in ('admin', 'staff-admin', 'moderator');
$$;

revoke all on function public.jwt_app_role() from public;
revoke all on function public.is_marketplace_staff() from public;
grant execute on function public.jwt_app_role() to anon, authenticated;
grant execute on function public.is_marketplace_staff() to anon, authenticated;

drop policy if exists "View products" on public.products;
create policy "View products"
    on public.products
    for select
    using (
        is_active = true
        or auth.uid() = seller_id
        or public.is_marketplace_staff()
    );

drop policy if exists "Update own products" on public.products;
create policy "Update own products"
    on public.products
    for update
    using (auth.uid() = seller_id or public.is_marketplace_staff())
    with check (
        (auth.uid() = seller_id or public.is_marketplace_staff())
        and (
            sponsor_store_id is null
            or exists (
                select 1
                from public.sponsor_stores s
                where s.id = products.sponsor_store_id
                  and s.owner_user_id = products.seller_id
            )
        )
    );

create or replace function public.trg_products_publish_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.is_active is not distinct from old.is_active
     and new.is_promoted is not distinct from old.is_promoted
     and new.seller_id is not distinct from old.seller_id then
    return new;
  end if;

  actor_role := auth.role();
  if actor_role in ('service_role', 'supabase_admin') then
    return new;
  end if;

  if public.is_marketplace_staff() then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'Only admin can publish this listing',
    detail = 'ku_listing_publish_forbidden';
end;
$$;

drop trigger if exists trg_products_publish_guard on public.products;
create trigger trg_products_publish_guard
  before update on public.products
  for each row
  execute function public.trg_products_publish_guard();

revoke all on function public.trg_products_publish_guard() from public;

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
  jwt_role text;
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

  now_utc := timezone('utc', now());

  -- Unpublished collab drafts do not consume the daily cap.
  if new.is_active is not true then
    new.created_at := now_utc;
    new.updated_at := now_utc;
    return new;
  end if;

  -- Permanent product rule: admin / staff-admin bypass daily caps.
  jwt_role := public.jwt_app_role();

  if jwt_role in ('admin', 'staff-admin') then
    new.created_at := now_utc;
    new.updated_at := now_utc;
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

  new.created_at := now_utc;
  new.updated_at := now_utc;

  return new;
end;
$$;

revoke all on function public.trg_products_enforce_daily_limit() from public;
