-- Partnership inquiries for brand/collab submissions
set search_path = public;

create table if not exists public.partnership_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  company text,
  email text not null,
  website text,
  partnership_type text not null,
  message text not null,
  budget_range text,
  country text,
  city text,
  phone text,
  attachment_url text,
  status text not null default 'new',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partnership_inquiries_name_len check (length(name) <= 140),
  constraint partnership_inquiries_company_len check (company is null or length(company) <= 140),
  constraint partnership_inquiries_email_len check (length(email) <= 255),
  constraint partnership_inquiries_website_len check (website is null or length(website) <= 512),
  constraint partnership_inquiries_type_len check (length(partnership_type) <= 64),
  constraint partnership_inquiries_message_len check (length(message) <= 4000),
  constraint partnership_inquiries_budget_len check (budget_range is null or length(budget_range) <= 64),
  constraint partnership_inquiries_country_len check (country is null or length(country) <= 80),
  constraint partnership_inquiries_city_len check (city is null or length(city) <= 80),
  constraint partnership_inquiries_phone_len check (phone is null or length(phone) <= 40),
  constraint partnership_inquiries_attachment_len check (attachment_url is null or length(attachment_url) <= 512),
  constraint partnership_inquiries_status_len check (length(status) <= 32)
);

create index if not exists idx_partnership_inquiries_created_at
  on public.partnership_inquiries (created_at desc);

create index if not exists idx_partnership_inquiries_status
  on public.partnership_inquiries (status, created_at desc);

create or replace function public.trg_partnership_inquiries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_partnership_inquiries_set_updated_at on public.partnership_inquiries;
create trigger trg_partnership_inquiries_set_updated_at
  before update on public.partnership_inquiries
  for each row
  execute procedure public.trg_partnership_inquiries_set_updated_at();

alter table public.partnership_inquiries enable row level security;

-- Anyone can create an inquiry (including anonymous visitors).
drop policy if exists "Insert partnership inquiries" on public.partnership_inquiries;
create policy "Insert partnership inquiries"
  on public.partnership_inquiries
  for insert
  with check (true);

-- Staff can view all inquiries.
drop policy if exists "Staff read partnership inquiries" on public.partnership_inquiries;
create policy "Staff read partnership inquiries"
  on public.partnership_inquiries
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Staff can update status/notes.
drop policy if exists "Staff update partnership inquiries" on public.partnership_inquiries;
create policy "Staff update partnership inquiries"
  on public.partnership_inquiries
  for update
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));
