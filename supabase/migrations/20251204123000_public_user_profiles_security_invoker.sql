-- Ensure public.public_user_profiles runs with invoker rights so RLS applies.
set search_path = public;

begin;

drop view if exists public.public_user_profiles;

create or replace view public.public_user_profiles
with (security_invoker = true) as
select
  id,
  full_name,
  avatar_url,
  rating,
  total_ratings,
  is_verified
from public.users;

commit;
