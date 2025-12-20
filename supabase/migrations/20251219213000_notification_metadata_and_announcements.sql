set search_path = public;

-- Add structured metadata to notifications so the UI can render rich cards
-- without relying on fragile parsing of the content column.
alter table public.notifications
  add column if not exists meta jsonb;

comment on column public.notifications.meta is 'Optional structured metadata for rendering notifications (kind, prices, severity, etc).';

-- Users can opt-in to system announcements (maintenance, policy updates, feature rollouts).
alter table public.users
  add column if not exists notify_announcements boolean default false;

comment on column public.users.notify_announcements is 'Opt-in to receive system announcements (maintenance, policy updates, feature rollouts).';

-- Optional announcements log (audit + future UI). Notifications can reference announcements.id via related_id.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.announcements enable row level security;

-- Create a helper RPC that publishes an announcement and fans out notifications
-- to users who opted-in (notify_announcements = true).
create or replace function public.publish_announcement(
  p_title text,
  p_body text,
  p_severity text default 'info',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement_id uuid;
begin
  insert into public.announcements (title, body, severity, starts_at, ends_at, created_at)
  values (p_title, p_body, coalesce(nullif(p_severity, ''), 'info'), p_starts_at, p_ends_at, timezone('utc', now()))
  returning id into announcement_id;

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at, meta)
  select
    u.id,
    p_title,
    left(coalesce(p_body, ''), 280),
    'system',
    announcement_id,
    false,
    timezone('utc', now()),
    jsonb_build_object('kind', 'announcement', 'severity', coalesce(nullif(p_severity, ''), 'info'))
  from public.users u
  where coalesce(u.notify_announcements, false) = true;

  return announcement_id;
end;
$$;

