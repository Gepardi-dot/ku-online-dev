set search_path = public;

-- Allow message-triggered notifications to insert under RLS.
drop policy if exists "Insert message notifications" on public.notifications;
create policy "Insert message notifications"
    on public.notifications
    for insert
    with check (
        auth.role() = 'authenticated'
        and type = 'message'
        and related_id is not null
        and exists (
            select 1
            from public.conversations c
            where c.id = notifications.related_id
              and auth.uid() in (c.seller_id, c.buyer_id)
              and notifications.user_id in (c.seller_id, c.buyer_id)
              and notifications.user_id <> auth.uid()
        )
    );
