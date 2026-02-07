set search_path = public;

-- Store engagement: click events, likes, and denormalized live stats for realtime UI chips.

create table if not exists public.sponsor_store_click_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  source text not null default 'spotlight_card',
  locale text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_store_click_events_source_len check (char_length(source) between 2 and 32),
  constraint sponsor_store_click_events_locale_len check (locale is null or char_length(locale) between 2 and 16)
);

create index if not exists idx_sponsor_store_click_events_store_created
  on public.sponsor_store_click_events (store_id, created_at desc);

create index if not exists idx_sponsor_store_click_events_created_at
  on public.sponsor_store_click_events (created_at desc);

create table if not exists public.sponsor_store_likes (
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (store_id, user_id)
);

create index if not exists idx_sponsor_store_likes_user
  on public.sponsor_store_likes (user_id, created_at desc);

create table if not exists public.sponsor_store_live_stats (
  store_id uuid primary key references public.sponsor_stores(id) on delete cascade,
  total_clicks bigint not null default 0,
  total_likes bigint not null default 0,
  last_click_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_store_live_stats_clicks_non_negative check (total_clicks >= 0),
  constraint sponsor_store_live_stats_likes_non_negative check (total_likes >= 0)
);

create index if not exists idx_sponsor_store_live_stats_updated_at
  on public.sponsor_store_live_stats (updated_at desc);

create or replace function public.bump_sponsor_store_click_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sponsor_store_live_stats (store_id, total_clicks, total_likes, last_click_at)
  values (new.store_id, 1, 0, new.created_at)
  on conflict (store_id) do update
    set total_clicks = public.sponsor_store_live_stats.total_clicks + 1,
        last_click_at = greatest(
          coalesce(public.sponsor_store_live_stats.last_click_at, '-infinity'::timestamptz),
          new.created_at
        ),
        updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.bump_sponsor_store_like_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sponsor_store_live_stats (store_id, total_clicks, total_likes, last_click_at)
  values (new.store_id, 0, 1, null)
  on conflict (store_id) do update
    set total_likes = public.sponsor_store_live_stats.total_likes + 1,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.decrement_sponsor_store_like_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sponsor_store_live_stats
  set total_likes = greatest(0, total_likes - 1),
      updated_at = timezone('utc', now())
  where store_id = old.store_id;

  return old;
end;
$$;

drop trigger if exists trg_sponsor_store_click_events_bump_stats on public.sponsor_store_click_events;
create trigger trg_sponsor_store_click_events_bump_stats
  after insert on public.sponsor_store_click_events
  for each row
  execute procedure public.bump_sponsor_store_click_stats();

drop trigger if exists trg_sponsor_store_likes_bump_stats on public.sponsor_store_likes;
create trigger trg_sponsor_store_likes_bump_stats
  after insert on public.sponsor_store_likes
  for each row
  execute procedure public.bump_sponsor_store_like_stats();

drop trigger if exists trg_sponsor_store_likes_decrement_stats on public.sponsor_store_likes;
create trigger trg_sponsor_store_likes_decrement_stats
  after delete on public.sponsor_store_likes
  for each row
  execute procedure public.decrement_sponsor_store_like_stats();

alter table public.sponsor_store_click_events enable row level security;
alter table public.sponsor_store_likes enable row level security;
alter table public.sponsor_store_live_stats enable row level security;

-- Click events stay private and are inserted server-side.

drop policy if exists "Users read own sponsor store likes" on public.sponsor_store_likes;
create policy "Users read own sponsor store likes"
  on public.sponsor_store_likes
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own sponsor store likes" on public.sponsor_store_likes;
create policy "Users insert own sponsor store likes"
  on public.sponsor_store_likes
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.sponsor_stores s
      where s.id = sponsor_store_likes.store_id
        and s.status = 'active'
    )
  );

drop policy if exists "Users delete own sponsor store likes" on public.sponsor_store_likes;
create policy "Users delete own sponsor store likes"
  on public.sponsor_store_likes
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Public read live sponsor store stats" on public.sponsor_store_live_stats;
create policy "Public read live sponsor store stats"
  on public.sponsor_store_live_stats
  for select
  using (
    exists (
      select 1
      from public.sponsor_stores s
      where s.id = sponsor_store_live_stats.store_id
        and s.status = 'active'
    )
  );

drop policy if exists "Sponsor staff read live stats for their store" on public.sponsor_store_live_stats;
create policy "Sponsor staff read live stats for their store"
  on public.sponsor_store_live_stats
  for select
  using (
    exists (
      select 1
      from public.sponsor_store_staff ss
      where ss.store_id = sponsor_store_live_stats.store_id
        and ss.user_id = auth.uid()
        and ss.status = 'active'
    )
  );

-- Realtime publication for client websocket subscriptions.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'sponsor_store_live_stats'
    ) then
      execute 'alter publication supabase_realtime add table public.sponsor_store_live_stats';
    end if;
  end if;
end $$;
