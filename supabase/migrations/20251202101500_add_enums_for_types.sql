-- Add enums for notification/message/abuse report statuses and migrate columns.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum ('message', 'system', 'favorite');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_type') then
    create type public.message_type as enum ('text', 'image', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'abuse_report_status') then
    create type public.abuse_report_status as enum ('open', 'auto-flagged', 'resolved', 'dismissed');
  end if;
end;
$$;

-- Migrate notifications.type -> notification_type
alter table public.notifications
  alter column type drop default,
  alter column type type notification_type using type::notification_type,
  alter column type set default 'message';

-- Migrate messages.message_type -> message_type enum
alter table public.messages
  alter column message_type drop default,
  alter column message_type type message_type using message_type::message_type,
  alter column message_type set default 'text';

-- Migrate abuse_reports.status -> abuse_report_status enum
alter table public.abuse_reports
  alter column status drop default,
  alter column status type abuse_report_status using status::abuse_report_status,
  alter column status set default 'open';
