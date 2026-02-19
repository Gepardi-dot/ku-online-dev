create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  expiration_time timestamptz,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists trg_push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_touch_updated_at
before update on public.push_subscriptions
for each row
execute function public.touch_updated_at();

