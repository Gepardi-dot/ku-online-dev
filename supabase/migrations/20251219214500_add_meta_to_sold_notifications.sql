set search_path = public;

-- Enrich sold notifications with metadata so the UI can render a consistent badge.
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

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at, meta)
  select
    f.user_id,
    'Listing you saved was sold',
    coalesce(new.title, ''),
    'listing',
    new.id,
    false,
    timezone('utc', now()),
    jsonb_build_object('kind', 'sold')
  from public.favorites f
  join public.users u on u.id = f.user_id
  where f.product_id = new.id
    and f.user_id is not null
    and f.user_id <> new.seller_id
    and coalesce(u.notify_updates, true) = true;

  return new;
end;
$$;

