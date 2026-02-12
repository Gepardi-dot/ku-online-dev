set search_path = public;

alter table if exists public.app_settings
  add column if not exists sponsor_live_stats_public boolean not null default false;

insert into public.app_settings (id, sponsor_live_stats_public)
values (true, false)
on conflict (id) do nothing;

update public.app_settings
set sponsor_live_stats_public = coalesce(sponsor_live_stats_public, false)
where id = true;

create or replace function public.is_sponsor_live_stats_public()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select sponsor_live_stats_public
      from public.app_settings
      where id = true
      limit 1
    ),
    false
  );
$$;

drop policy if exists "Public read live sponsor store stats" on public.sponsor_store_live_stats;
drop policy if exists "Public or moderators read live sponsor store stats" on public.sponsor_store_live_stats;

create policy "Public or moderators read live sponsor store stats"
  on public.sponsor_store_live_stats
  for select
  using (
    exists (
      select 1
      from public.sponsor_stores s
      where s.id = sponsor_store_live_stats.store_id
        and s.status = 'active'
    )
    and (
      (auth.jwt() ->> 'role') in ('admin', 'moderator')
      or public.is_sponsor_live_stats_public()
    )
  );
