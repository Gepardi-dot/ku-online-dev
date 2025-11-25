-- Recreate public.public_user_profiles without SECURITY DEFINER.
set search_path = public;

begin;

-- Drop the old view if it exists.
drop view if exists public.public_user_profiles;

-- Recreate the view with the original projection.
create or replace view public.public_user_profiles as
select
  id,
  full_name,
  avatar_url,
  rating,
  total_ratings,
  is_verified
from public.users;

commit;
