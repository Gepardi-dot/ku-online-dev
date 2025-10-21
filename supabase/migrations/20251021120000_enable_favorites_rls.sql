-- Ensure favorites table enforces row level security with the expected policies.
set search_path = public;

alter table public.favorites enable row level security;

drop policy if exists "View favorites" on public.favorites;
create policy "View favorites"
  on public.favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "Manage favorites" on public.favorites;
create policy "Manage favorites"
  on public.favorites
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
