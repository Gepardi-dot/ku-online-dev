-- Move sponsor click-event ingestion to scoped auth/anon inserts under RLS.
set search_path = public;

drop policy if exists sponsor_store_click_events_insert_anonymous on public.sponsor_store_click_events;
drop policy if exists sponsor_store_click_events_insert_authenticated on public.sponsor_store_click_events;

create policy sponsor_store_click_events_insert_anonymous
on public.sponsor_store_click_events
as permissive
for insert
to anon
with check (
  user_id is null
  and source in ('spotlight_card', 'store_page')
  and exists (
    select 1
    from public.sponsor_stores s
    where s.id = sponsor_store_click_events.store_id
      and s.status = 'active'
  )
);

create policy sponsor_store_click_events_insert_authenticated
on public.sponsor_store_click_events
as permissive
for insert
to authenticated
with check (
  user_id = auth.uid()
  and source in ('spotlight_card', 'store_page')
  and exists (
    select 1
    from public.sponsor_stores s
    where s.id = sponsor_store_click_events.store_id
      and s.status = 'active'
  )
);
