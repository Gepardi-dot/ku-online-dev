set search_path = public;

-- Keep auth <-> public.users synchronization resilient to missing profile fields.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    full_name text;
    preferred text;
    avatar text;
begin
    full_name := coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'fullName'
    );
    preferred := coalesce(
        new.raw_user_meta_data->>'preferred_username',
        new.raw_user_meta_data->>'user_name',
        new.raw_user_meta_data->>'username'
    );
    avatar := new.raw_user_meta_data->>'avatar_url';

    insert into public.users (
        id,
        email,
        full_name,
        avatar_url,
        created_at,
        updated_at
    )
    values (
        new.id,
        new.email,
        nullif(full_name, ''),
        nullif(avatar, ''),
        timezone('utc', now()),
        timezone('utc', now())
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
        avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.users.avatar_url),
        updated_at = timezone('utc', now());

    return new;
end;
$$;
