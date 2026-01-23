set search_path = public;

-- Keep phone numbers in sync between `auth.users` and `public.users` so
-- phone-based signups create a usable profile row.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    full_name text;
    avatar text;
begin
    full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
    avatar := new.raw_user_meta_data->>'avatar_url';

    insert into public.users (id, email, phone, full_name, avatar_url, created_at, updated_at)
    values (
        new.id,
        new.email,
        nullif(new.phone, ''),
        nullif(full_name, ''),
        nullif(avatar, ''),
        timezone('utc', now()),
        timezone('utc', now())
    )
    on conflict (id) do update
    set email = excluded.email,
        phone = coalesce(nullif(excluded.phone, ''), public.users.phone),
        full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
        avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.users.avatar_url),
        updated_at = timezone('utc', now());

    return new;
end;
$$;

-- Backfill phone numbers for existing rows that were created before we synced `new.phone`.
update public.users u
set phone = au.phone,
    updated_at = timezone('utc', now())
from auth.users au
where u.id = au.id
  and (u.phone is null or u.phone = '')
  and au.phone is not null
  and au.phone <> '';
