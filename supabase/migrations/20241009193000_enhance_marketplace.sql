-- Align Supabase schema, policies, and helper routines with the KU-ONLINE marketplace feature set.
set search_path = public;

-- Extensions -----------------------------------------------------------------
create extension if not exists "pg_trgm";

-- Users -----------------------------------------------------------------------
alter table public.users
    add column if not exists response_rate numeric(5, 2),
    add column if not exists last_seen_at timestamptz,
    add column if not exists response_time_minutes integer;

-- Conversations ----------------------------------------------------------------
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

alter table public.messages
    drop constraint if exists messages_conversation_id_fkey,
    add constraint messages_conversation_id_fkey
        foreign key (conversation_id)
        references public.conversations(id)
        on delete cascade;

-- Generated search document for full-text queries --------------------------------
alter table public.products
    add column if not exists search_document tsvector
        generated always as (
            to_tsvector(
                'simple',
                coalesce(title, '') || ' ' || coalesce(description, '')
            )
        ) stored;

-- Indexes ---------------------------------------------------------------------
create index if not exists idx_products_is_active_created_at
    on public.products (is_active, created_at desc);

create index if not exists idx_products_category_created_at
    on public.products (category_id, created_at desc);

create index if not exists idx_products_price
    on public.products (price);

create index if not exists idx_products_condition
    on public.products (condition, created_at desc);

create index if not exists idx_products_location_trgm
    on public.products using gin (location gin_trgm_ops);

create index if not exists idx_products_title_trgm
    on public.products using gin (title gin_trgm_ops);

create index if not exists idx_products_search_document
    on public.products using gin (search_document);

create index if not exists idx_conversations_seller
    on public.conversations (seller_id, updated_at desc);

create index if not exists idx_conversations_buyer
    on public.conversations (buyer_id, updated_at desc);

create index if not exists idx_conversations_product
    on public.conversations (product_id, updated_at desc);

create index if not exists idx_messages_conversation_created_at
    on public.messages (conversation_id, created_at desc);

create index if not exists idx_messages_sender
    on public.messages (sender_id, created_at desc);

create index if not exists idx_messages_receiver
    on public.messages (receiver_id, created_at desc);

create index if not exists idx_favorites_user_created
    on public.favorites (user_id, created_at desc);

create index if not exists idx_notifications_user_created
    on public.notifications (user_id, created_at desc);

create index if not exists idx_categories_is_active_sort
    on public.categories (is_active, sort_order, name);

-- Updated-at helper -----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_products_touch_updated_at on public.products;
create trigger trg_products_touch_updated_at
    before update on public.products
    for each row
    execute procedure public.touch_updated_at();

drop trigger if exists trg_users_touch_updated_at on public.users;
create trigger trg_users_touch_updated_at
    before update on public.users
    for each row
    execute procedure public.touch_updated_at();

drop trigger if exists trg_conversations_touch_updated_at on public.conversations;
create trigger trg_conversations_touch_updated_at
    before update on public.conversations
    for each row
    execute procedure public.touch_updated_at();

-- Auth <-> public.users synchronization ---------------------------------------
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    full_name text;
    avatar text;
begin
    full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
    avatar := new.raw_user_meta_data->>'avatar_url';

    insert into public.users (id, email, full_name, avatar_url, created_at, updated_at)
    values (
        new.id,
        new.email,
        nullif(full_name, ''),
        nullif(avatar, ''),
        timezone('utc', now()),
        timezone('utc', now())
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
        avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.users.avatar_url),
        updated_at = timezone('utc', now());

    return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row
    execute procedure public.handle_auth_user_change();

drop trigger if exists trg_on_auth_user_updated on auth.users;
create trigger trg_on_auth_user_updated
    after update on auth.users
    for each row
    execute procedure public.handle_auth_user_change();

-- Ratings maintenance ---------------------------------------------------------
create or replace function public.recalculate_user_rating(target_user uuid)
returns void
language plpgsql
as $$
declare
    aggregated record;
begin
    if target_user is null then
        return;
    end if;

    select
        coalesce(avg(rating)::numeric, 0)::numeric(6, 2) as avg_rating,
        count(*)::integer as rating_count
    into aggregated
    from public.reviews
    where seller_id = target_user;

    update public.users
    set rating = coalesce(aggregated.avg_rating, 0),
        total_ratings = coalesce(aggregated.rating_count, 0),
        updated_at = timezone('utc', now())
    where id = target_user;
end;
$$;

create or replace function public.handle_review_change()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        perform public.recalculate_user_rating(new.seller_id);
    elsif tg_op = 'UPDATE' then
        if old.seller_id is distinct from new.seller_id then
            perform public.recalculate_user_rating(old.seller_id);
        end if;
        perform public.recalculate_user_rating(new.seller_id);
    elsif tg_op = 'DELETE' then
        perform public.recalculate_user_rating(old.seller_id);
    end if;

    return null;
end;
$$;

drop trigger if exists trg_reviews_after_insert on public.reviews;
create trigger trg_reviews_after_insert
    after insert on public.reviews
    for each row
    execute procedure public.handle_review_change();

drop trigger if exists trg_reviews_after_update on public.reviews;
create trigger trg_reviews_after_update
    after update on public.reviews
    for each row
    execute procedure public.handle_review_change();

drop trigger if exists trg_reviews_after_delete on public.reviews;
create trigger trg_reviews_after_delete
    after delete on public.reviews
    for each row
    execute procedure public.handle_review_change();

-- Conversation helpers --------------------------------------------------------
create or replace function public.get_or_create_conversation(
    p_seller_id uuid,
    p_buyer_id uuid,
    p_product_id uuid default null
)
returns uuid
language plpgsql
security definer
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

create or replace function public.handle_new_message()
returns trigger
language plpgsql
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

-- Full-text search RPC --------------------------------------------------------
create or replace function public.search_products(
    search_term text,
    category uuid default null,
    min_price numeric default null,
    max_price numeric default null,
    city text default null,
    limit_count integer default 24,
    offset_count integer default 0
)
returns table (
    id uuid,
    title text,
    description text,
    price numeric,
    currency varchar,
    condition text,
    category_id uuid,
    seller_id uuid,
    location text,
    images jsonb,
    is_active boolean,
    is_sold boolean,
    is_promoted boolean,
    views integer,
    created_at timestamptz,
    updated_at timestamptz,
    rank numeric
)
language plpgsql
as $$
begin
    return query
    select
        p.id,
        p.title,
        p.description,
        p.price,
        p.currency,
        p.condition,
        p.category_id,
        p.seller_id,
        p.location,
        p.images,
        p.is_active,
        p.is_sold,
        p.is_promoted,
        p.views,
        p.created_at,
        p.updated_at,
        coalesce(
            case
                when search_term is null or btrim(search_term) = ''
                    then 0
                else ts_rank(p.search_document, plainto_tsquery('simple', search_term))
            end,
            0
        ) as rank
    from public.products p
    where
        (p.is_active = true)
        and (
            search_term is null
            or btrim(search_term) = ''
            or p.search_document @@ plainto_tsquery('simple', search_term)
        )
        and (
            category is null
            or p.category_id = category
        )
        and (
            min_price is null
            or p.price >= min_price
        )
        and (
            max_price is null
            or p.price <= max_price
        )
        and (
            city is null
            or btrim(city) = ''
            or p.location ilike city || '%'
        )
    order by
        case
            when search_term is null or btrim(search_term) = ''
                then null
            else coalesce(ts_rank(p.search_document, plainto_tsquery('simple', search_term)), 0)
        end desc,
        p.created_at desc
    limit greatest(limit_count, 1)
    offset greatest(offset_count, 0);
end;
$$;

grant execute on function public.search_products(text, uuid, numeric, numeric, text, integer, integer) to authenticated;

-- Row Level Security for conversations ---------------------------------------
alter table public.conversations enable row level security;

drop policy if exists "View own conversations" on public.conversations;
create policy "View own conversations"
    on public.conversations
    for select
    using (auth.uid() = seller_id or auth.uid() = buyer_id);

drop policy if exists "Create conversations" on public.conversations;
create policy "Create conversations"
    on public.conversations
    for insert
    with check (auth.uid() = seller_id or auth.uid() = buyer_id);

drop policy if exists "Update conversations" on public.conversations;
create policy "Update conversations"
    on public.conversations
    for update
    using (auth.uid() = seller_id or auth.uid() = buyer_id)
    with check (auth.uid() = seller_id or auth.uid() = buyer_id);

