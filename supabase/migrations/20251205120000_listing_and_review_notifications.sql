set search_path = public;

-- Extend notification_type enum to cover marketplace activity
-- related to sold listings. We no longer emit FAVORITE-type
-- notifications (even though the enum value may exist).
do $$
begin
  if exists (select 1 from pg_type where typname = 'notification_type') then
    begin
      alter type public.notification_type add value if not exists 'listing';
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

-- Notify watchers when a listing they saved is marked as sold.
create or replace function public.notify_listing_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.is_sold, false) = coalesce(new.is_sold, false) then
    return new;
  end if;

  if new.is_sold is not true then
    return new;
  end if;

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at)
  select
    f.user_id,
    'Listing you saved was sold',
    coalesce(new.title, ''),
    'listing',
    new.id,
    false,
    timezone('utc', now())
  from public.favorites f
  join public.users u on u.id = f.user_id
  where f.product_id = new.id
    and f.user_id is not null
    and f.user_id <> new.seller_id
    and coalesce(u.notify_updates, true) = true;

  return new;
end;
$$;

drop trigger if exists trg_products_after_update_notify_sold on public.products;
create trigger trg_products_after_update_notify_sold
  after update of is_sold on public.products
  for each row
  execute procedure public.notify_listing_sold();
