set search_path = public;

-- Respect user notification preferences when emitting message notifications.
create or replace function public.handle_new_message()
returns trigger
language plpgsql
as $$
declare
    recipient uuid;
    allow_notify boolean := true;
begin
    update public.conversations
    set last_message = new.content,
        last_message_at = new.created_at,
        updated_at = new.created_at
    where id = new.conversation_id;

    if new.receiver_id is not null and new.receiver_id is distinct from new.sender_id then
        recipient := new.receiver_id;

        select coalesce(u.notify_messages, true)
        into allow_notify
        from public.users u
        where u.id = recipient;

        if allow_notify then
            insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at)
            values (
                recipient,
                'New message received',
                left(coalesce(new.content, ''), 200),
                'message',
                new.conversation_id,
                false,
                new.created_at
            )
            on conflict do nothing;
        end if;
    end if;

    return new;
end;
$$;
