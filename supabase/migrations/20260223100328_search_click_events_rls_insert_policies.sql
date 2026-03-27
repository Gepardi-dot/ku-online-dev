-- Move search click ingestion to scoped auth inserts under RLS.
set search_path = public;

drop policy if exists search_click_events_insert_anonymous on public.search_click_events;
drop policy if exists search_click_events_insert_authenticated on public.search_click_events;

create policy search_click_events_insert_anonymous
on public.search_click_events
as permissive
for insert
to anon
with check (user_id is null);

create policy search_click_events_insert_authenticated
on public.search_click_events
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);
