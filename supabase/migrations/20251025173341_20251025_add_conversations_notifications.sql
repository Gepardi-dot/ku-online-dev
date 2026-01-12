set search_path = public;

-- Conversations table and helpers
create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete set null,
    seller_id uuid not null references public.users(id) on delete cascade,
    buyer_id uuid not null references public.users(id) on delete cascade,
    last_message text,
    last_message_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint conversations_participants_unique unique (seller_id, buyer_id, product_id)
);

alter table public.conversations enable row level security;

create index if not exists idx_conversations_seller on public.conversations (seller_id, updated_at desc);
create index if not exists idx_conversations_buyer on public.conversations (buyer_id, updated_at desc);
create index if not exists idx_conversations_product on public.conversations (product_id, updated_at desc);

-- Ensure messages reference conversations
alter table public.messages
    drop constraint if exists messages_conversation_id_fkey,
    add constraint messages_conversation_id_fkey
        foreign key (conversation_id)
        references public.conversations(id)
        on delete cascade;

-- Touch helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_conversations_touch_updated_at on public.conversations;
create trigger trg_conversations_touch_updated_at
    before update on public.conversations
    for each row
    execute procedure public.touch_updated_at();

-- Conversation policies
drop policy if exists "View conversations" on public.conversations;
create policy "View conversations"
    on public.conversations
    for select
    using (auth.uid() = seller_id or auth.uid() = buyer_id);

drop policy if exists "Insert conversations" on public.conversations;
create policy "Insert conversations"
    on public.conversations
    for insert
    with check (auth.uid() = seller_id or auth.uid() = buyer_id);

drop policy if exists "Update conversations" on public.conversations;
create policy "Update conversations"
    on public.conversations
    for update
    using (auth.uid() = seller_id or auth.uid() = buyer_id)
    with check (auth.uid() = seller_id or auth.uid() = buyer_id);

-- Conversation helper RPC
create or replace function public.get_or_create_conversation(
    p_seller_id uuid,
    p_buyer_id uuid,
    p_product_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    conversation_id uuid;
begin
    select id
    into conversation_id
    from public.conversations
    where seller_id = p_seller_id
      and buyer_id = p_buyer_id
      and (
        (p_product_id is null and product_id is null)
        or product_id = p_product_id
      )
    limit 1;

    if conversation_id is null then
        insert into public.conversations (seller_id, buyer_id, product_id)
        values (p_seller_id, p_buyer_id, p_product_id)
        returning id into conversation_id;
    end if;

    return conversation_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid, uuid, uuid) to authenticated;

-- Notifications when new messages arrive
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    recipient uuid;
begin
    update public.conversations
    set last_message = new.content,
        last_message_at = new.created_at,
        updated_at = new.created_at
    where id = new.conversation_id;

    if new.receiver_id is not null and new.receiver_id is distinct from new.sender_id then
        recipient := new.receiver_id;

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

    return new;
end;
$$;

drop trigger if exists trg_messages_after_insert on public.messages;
create trigger trg_messages_after_insert
    after insert on public.messages
    for each row
    execute procedure public.handle_new_message();

-- Notifications policies (ensure updates allowed)
drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications"
    on public.notifications
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users can update their notifications" on public.notifications;
create policy "Users can update their notifications"
    on public.notifications
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
;
