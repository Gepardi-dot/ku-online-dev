set search_path = public;

-- Speed up dedupe checks for per-listing notifications.
create index if not exists idx_notifications_user_related_title_created
  on public.notifications (user_id, related_id, title, created_at desc);

-- Track original price when sellers reduce a listing price.
create or replace function public.track_original_price_on_drop()
returns trigger
language plpgsql
as $$
begin
  if new.price is null or old.price is null then
    return new;
  end if;

  if new.price < old.price then
    -- Keep the immediate previous price as the strikethrough "old price".
    new.original_price = old.price;
  elsif old.original_price is not null and new.price >= old.original_price then
    -- If the price rises back to (or above) the original, clear the old price indicator.
    new.original_price = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_before_update_track_original_price on public.products;
create trigger trg_products_before_update_track_original_price
  before update of price on public.products
  for each row
  execute procedure public.track_original_price_on_drop();

-- Notify watchers when the price of a saved listing decreases.
create or replace function public.notify_listing_price_drop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is null or old.price is null then
    return new;
  end if;

  if new.price >= old.price then
    return new;
  end if;

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at, meta)
  select
    f.user_id,
    'Price Updated',
    coalesce(new.title, ''),
    'listing',
    new.id,
    false,
    timezone('utc', now()),
    jsonb_build_object(
      'kind', 'price_updated',
      'oldPrice', old.price,
      'newPrice', new.price,
      'currency', coalesce(new.currency, 'IQD')
    )
  from public.favorites f
  join public.users u on u.id = f.user_id
  where f.product_id = new.id
    and f.user_id is not null
    and f.user_id <> new.seller_id
    and coalesce(u.notify_updates, true) = true
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = f.user_id
        and n.type = 'listing'
        and n.related_id = new.id
        and n.title = 'Price Updated'
        and n.created_at > timezone('utc', now()) - interval '24 hours'
    );

  return new;
end;
$$;

drop trigger if exists trg_products_after_update_notify_price_drop on public.products;
create trigger trg_products_after_update_notify_price_drop
  after update of price on public.products
  for each row
  execute procedure public.notify_listing_price_drop();

-- Notify watchers when a saved listing's core details change (photos/description/title).
create or replace function public.notify_listing_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_active, true) is not true then
    return new;
  end if;

  if coalesce(new.is_sold, false) is true then
    return new;
  end if;

  if new.title is not distinct from old.title
     and new.description is not distinct from old.description
     and new.images is not distinct from old.images then
    return new;
  end if;

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at, meta)
  select
    f.user_id,
    'Listing Updated',
    coalesce(new.title, ''),
    'listing',
    new.id,
    false,
    timezone('utc', now()),
    jsonb_build_object('kind', 'listing_updated')
  from public.favorites f
  join public.users u on u.id = f.user_id
  where f.product_id = new.id
    and f.user_id is not null
    and f.user_id <> new.seller_id
    and coalesce(u.notify_updates, true) = true
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = f.user_id
        and n.type = 'listing'
        and n.related_id = new.id
        and n.title = 'Listing Updated'
        and n.created_at > timezone('utc', now()) - interval '24 hours'
    );

  return new;
end;
$$;

drop trigger if exists trg_products_after_update_notify_listing_updated on public.products;
create trigger trg_products_after_update_notify_listing_updated
  after update of title, description, images on public.products
  for each row
  execute procedure public.notify_listing_updated();

-- Notify watchers when an inactive listing is re-activated.
create or replace function public.notify_listing_reactivated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.is_active, true) = coalesce(new.is_active, true) then
    return new;
  end if;

  if new.is_active is not true then
    return new;
  end if;

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at, meta)
  select
    f.user_id,
    'Listing Back Online',
    coalesce(new.title, ''),
    'listing',
    new.id,
    false,
    timezone('utc', now()),
    jsonb_build_object('kind', 'back_online')
  from public.favorites f
  join public.users u on u.id = f.user_id
  where f.product_id = new.id
    and f.user_id is not null
    and f.user_id <> new.seller_id
    and coalesce(u.notify_updates, true) = true;

  return new;
end;
$$;

drop trigger if exists trg_products_after_update_notify_reactivated on public.products;
create trigger trg_products_after_update_notify_reactivated
  after update of is_active on public.products
  for each row
  execute procedure public.notify_listing_reactivated();

