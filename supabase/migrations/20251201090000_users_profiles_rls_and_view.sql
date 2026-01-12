set search_path = public;

-- Tighten users RLS: only a user can see their own full row.
alter table public.users enable row level security;

drop policy if exists "Users can view profiles" on public.users;
drop policy if exists "User can view own profile" on public.users;

create policy "User can view own profile"
  on public.users
  for select
  using (auth.uid() = id);

-- Keep existing update/insert policies in place; they may have been created
-- by previous migrations (e.g. Users update own profile / Users insert own profile).

-- Public-facing, non-sensitive profile view.
create or replace view public.public_user_profiles as
select
  id,
  full_name,
  avatar_url,
  rating,
  total_ratings,
  is_verified
from public.users;
