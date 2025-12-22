-- Capture search -> click events to power automated synonym generation.
set search_path = public;

create table if not exists public.search_click_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete set null,
    product_id uuid not null references public.products(id) on delete cascade,
    locale text,
    query text not null,
    created_at timestamptz not null default timezone('utc', now()),
    constraint search_click_events_query_length check (char_length(query) between 2 and 200),
    constraint search_click_events_locale_length check (locale is null or char_length(locale) between 2 and 16)
);

alter table public.search_click_events enable row level security;

-- Events are inserted via a server-side route using the service role key.
-- No RLS policies are defined intentionally to keep logs private.

create index if not exists idx_search_click_events_created_at on public.search_click_events (created_at desc);
create index if not exists idx_search_click_events_product_id on public.search_click_events (product_id, created_at desc);
