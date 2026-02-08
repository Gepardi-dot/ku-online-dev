set search_path = public;

create table if not exists public.app_settings (
  id boolean primary key default true,
  support_email text,
  support_whatsapp text,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_settings_singleton check (id = true),
  constraint app_settings_support_email_len check (support_email is null or char_length(support_email) <= 255),
  constraint app_settings_support_whatsapp_len check (support_whatsapp is null or char_length(support_whatsapp) <= 64)
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists trg_app_settings_touch_updated_at on public.app_settings;
create trigger trg_app_settings_touch_updated_at
  before update on public.app_settings
  for each row
  execute procedure public.touch_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "Moderators read app settings" on public.app_settings;
create policy "Moderators read app settings"
  on public.app_settings
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

drop policy if exists "Admins update app settings" on public.app_settings;
create policy "Admins update app settings"
  on public.app_settings
  for update
  using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

