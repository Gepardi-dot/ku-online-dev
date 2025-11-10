-- Allow authenticated users to insert their own profile row.
-- This complements the existing UPDATE policy and makes client upserts safe.
set search_path = public;

alter table public.users enable row level security;

drop policy if exists "Users insert own profile" on public.users;
create policy "Users insert own profile"
  on public.users
  for insert
  with check (auth.uid() = id);

