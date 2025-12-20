set search_path = public;

alter table public.users
  add column if not exists name text;
