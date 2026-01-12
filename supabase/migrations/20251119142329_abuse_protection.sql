-- Abuse and fraud protection schema
set search_path = public;

-- Blocked users: allow users to block abusive accounts.
create table if not exists public.blocked_users (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    blocked_user_id uuid not null references public.users(id) on delete cascade,
    reason text,
    created_at timestamptz not null default timezone('utc', now()),
    constraint blocked_users_user_blocked_unique unique (user_id, blocked_user_id),
    constraint blocked_users_no_self_block check (user_id <> blocked_user_id)
);

alter table public.blocked_users enable row level security;

drop policy if exists "View blocked users" on public.blocked_users;
create policy "View blocked users"
    on public.blocked_users
    for select
    using (auth.uid() = user_id);

drop policy if exists "Manage blocked users" on public.blocked_users;
create policy "Manage blocked users"
    on public.blocked_users
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index if not exists idx_blocked_users_user on public.blocked_users (user_id, blocked_user_id);
create index if not exists idx_blocked_users_blocked on public.blocked_users (blocked_user_id, user_id);

-- Abuse reports: allow users to report listings, messages, or accounts.
create table if not exists public.abuse_reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references public.users(id) on delete cascade,
    reported_user_id uuid references public.users(id) on delete set null,
    product_id uuid references public.products(id) on delete set null,
    message_id uuid references public.messages(id) on delete set null,
    reason text not null,
    details text,
    status text not null default 'open',
    is_auto_flagged boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint abuse_reports_target_any check (
        ((product_id is not null)::int +
         (message_id is not null)::int +
         (reported_user_id is not null)::int) = 1
    )
);

alter table public.abuse_reports enable row level security;

drop policy if exists "View own abuse reports" on public.abuse_reports;
create policy "View own abuse reports"
    on public.abuse_reports
    for select
    using (auth.uid() = reporter_id);

drop policy if exists "Create abuse reports" on public.abuse_reports;
create policy "Create abuse reports"
    on public.abuse_reports
    for insert
    with check (auth.uid() = reporter_id);

drop policy if exists "Update own abuse reports" on public.abuse_reports;
create policy "Update own abuse reports"
    on public.abuse_reports
    for update
    using (auth.uid() = reporter_id)
    with check (auth.uid() = reporter_id);

create index if not exists idx_abuse_reports_reporter on public.abuse_reports (reporter_id, created_at desc);
create index if not exists idx_abuse_reports_reported_user on public.abuse_reports (reported_user_id, status, created_at desc);
create index if not exists idx_abuse_reports_product on public.abuse_reports (product_id, status, created_at desc);

-- Automatically flag heavily-reported listings or users to aid moderation.
create or replace function public.handle_abuse_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    report_threshold integer := 3;
    open_count integer := 0;
begin
    select count(*) into open_count
    from public.abuse_reports
    where status in ('open', 'auto-flagged')
      and (
        (new.product_id is not null and product_id = new.product_id) or
        (new.reported_user_id is not null and reported_user_id = new.reported_user_id)
      );

    if open_count >= report_threshold then
        update public.abuse_reports
        set is_auto_flagged = true,
            status = case when status = 'open' then 'auto-flagged' else status end,
            updated_at = timezone('utc', now())
        where id = new.id;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_abuse_reports_after_insert on public.abuse_reports;
create trigger trg_abuse_reports_after_insert
    after insert on public.abuse_reports
    for each row
    execute procedure public.handle_abuse_report();

-- Ensure message sending respects blocking relationships.
drop policy if exists "Send messages" on public.messages;
create policy "Send messages"
    on public.messages
    for insert
    with check (
        auth.uid() = sender_id
        and not exists (
            select 1
            from public.blocked_users b
            where
                -- Sender has blocked receiver
                (b.user_id = sender_id and b.blocked_user_id = receiver_id)
                or
                -- Receiver has blocked sender
                (b.user_id = receiver_id and b.blocked_user_id = sender_id)
        )
    );
