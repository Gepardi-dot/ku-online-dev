-- Core marketplace schema for ku-online-dev
create extension if not exists "pgcrypto";

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    email varchar(255) unique,
    phone varchar(20),
    full_name text,
    avatar_url text,
    location text,
    bio text,
    is_verified boolean not null default false,
    rating numeric(3, 2) not null default 0.00,
    total_ratings integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    name_ar text,
    name_ku text,
    description text,
    icon text,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    price numeric(10, 2) not null,
    currency varchar(3) not null default 'IQD',
    condition text not null,
    category_id uuid references public.categories(id) on delete set null,
    seller_id uuid references public.users(id) on delete set null,
    location text,
    images jsonb not null default '[]'::jsonb,
    is_active boolean not null default true,
    is_sold boolean not null default false,
    is_promoted boolean not null default false,
    views integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null,
    sender_id uuid references public.users(id) on delete set null,
    receiver_id uuid references public.users(id) on delete set null,
    product_id uuid references public.products(id) on delete set null,
    content text not null,
    message_type text not null default 'text',
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade,
    seller_id uuid references public.users(id) on delete set null,
    buyer_id uuid references public.users(id) on delete set null,
    rating integer not null check (rating between 1 and 5),
    comment text,
    is_anonymous boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    product_id uuid references public.products(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint favorites_user_product_unique unique (user_id, product_id)
);

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    title text not null,
    content text,
    type text not null,
    related_id uuid,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

-- Row Level Security policies
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users can view profiles" on public.users;
create policy "Users can view profiles"
    on public.users
    for select
    using (auth.role() in ('authenticated', 'anon'));

drop policy if exists "Users update own profile" on public.users;
create policy "Users update own profile"
    on public.users
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

drop policy if exists "Categories are readable" on public.categories;
create policy "Categories are readable"
    on public.categories
    for select
    using (true);

drop policy if exists "View products" on public.products;
create policy "View products"
    on public.products
    for select
    using (is_active = true or auth.uid() = seller_id);

drop policy if exists "Insert products as seller" on public.products;
create policy "Insert products as seller"
    on public.products
    for insert
    with check (auth.uid() = seller_id);

drop policy if exists "Update own products" on public.products;
create policy "Update own products"
    on public.products
    for update
    using (auth.uid() = seller_id)
    with check (auth.uid() = seller_id);

drop policy if exists "Delete own products" on public.products;
create policy "Delete own products"
    on public.products
    for delete
    using (auth.uid() = seller_id);

drop policy if exists "View messages in conversation" on public.messages;
create policy "View messages in conversation"
    on public.messages
    for select
    using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Send messages" on public.messages;
create policy "Send messages"
    on public.messages
    for insert
    with check (auth.uid() = sender_id);

drop policy if exists "Update messages visibility" on public.messages;
create policy "Update messages visibility"
    on public.messages
    for update
    using (auth.uid() = sender_id or auth.uid() = receiver_id)
    with check (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Delete own outbound messages" on public.messages;
create policy "Delete own outbound messages"
    on public.messages
    for delete
    using (auth.uid() = sender_id);

drop policy if exists "View reviews" on public.reviews;
create policy "View reviews"
    on public.reviews
    for select
    using (true);

drop policy if exists "Write reviews as buyer" on public.reviews;
create policy "Write reviews as buyer"
    on public.reviews
    for insert
    with check (auth.uid() = buyer_id);

drop policy if exists "Update own reviews" on public.reviews;
create policy "Update own reviews"
    on public.reviews
    for update
    using (auth.uid() = buyer_id)
    with check (auth.uid() = buyer_id);

drop policy if exists "Delete own reviews" on public.reviews;
create policy "Delete own reviews"
    on public.reviews
    for delete
    using (auth.uid() = buyer_id);

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

drop policy if exists "View notifications" on public.notifications;
create policy "View notifications"
    on public.notifications
    for select
    using (auth.uid() = user_id);

drop policy if exists "Mark notifications as read" on public.notifications;
create policy "Mark notifications as read"
    on public.notifications
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Delete notifications" on public.notifications;
create policy "Delete notifications"
    on public.notifications
    for delete
    using (auth.uid() = user_id);

-- Storage bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
do $$
begin
    begin
        execute 'set role supabase_storage_admin';
    exception
        when insufficient_privilege then
            raise notice 'Skipping storage role changes due to insufficient privileges.';
            return;
    end;

    alter table storage.objects enable row level security;

    drop policy if exists "Public read product images" on storage.objects;
    create policy "Public read product images"
        on storage.objects
        for select
        using (bucket_id = 'product-images');

    drop policy if exists "Authenticated upload product images" on storage.objects;
    create policy "Authenticated upload product images"
        on storage.objects
        for insert
        with check (
            bucket_id = 'product-images'
            and auth.role() = 'authenticated'
        );

    drop policy if exists "Update own product images" on storage.objects;
    create policy "Update own product images"
        on storage.objects
        for update
        using (
            bucket_id = 'product-images'
            and auth.uid() = owner
        )
        with check (
            bucket_id = 'product-images'
            and auth.uid() = owner
        );

    drop policy if exists "Delete own product images" on storage.objects;
    create policy "Delete own product images"
        on storage.objects
        for delete
        using (
            bucket_id = 'product-images'
            and auth.uid() = owner
        );

    execute 'reset role';
end;
$$;
