-- Verification requests for staff-reviewed badge
set search_path = public;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_request_status') then
    create type public.verification_request_status as enum ('pending', 'approved', 'rejected', 'needs_info');
  end if;
end $$;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status verification_request_status not null default 'pending',
  phone text,
  id_document_url text,
  business_document_url text,
  notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint verification_requests_phone_required check (phone is null or length(phone) <= 64),
  constraint verification_requests_id_doc_required check (id_document_url is null or length(id_document_url) <= 512),
  constraint verification_requests_biz_doc_required check (business_document_url is null or length(business_document_url) <= 512)
);

create index if not exists idx_verification_requests_user_created on public.verification_requests (user_id, created_at desc);
create unique index if not exists idx_verification_requests_user_pending
  on public.verification_requests (user_id)
  where status = 'pending';

create or replace function public.trg_verification_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_verification_requests_set_updated_at on public.verification_requests;
create trigger trg_verification_requests_set_updated_at
  before update on public.verification_requests
  for each row
  execute procedure public.trg_verification_requests_set_updated_at();

alter table public.verification_requests enable row level security;

-- Users can view their own requests
drop policy if exists "Select own verification requests" on public.verification_requests;
create policy "Select own verification requests"
  on public.verification_requests
  for select
  using (auth.uid() = user_id);

-- Users can create requests for themselves
drop policy if exists "Insert own verification requests" on public.verification_requests;
create policy "Insert own verification requests"
  on public.verification_requests
  for insert
  with check (auth.uid() = user_id);

-- Admins / moderators can read all
drop policy if exists "Staff read verification requests" on public.verification_requests;
create policy "Staff read verification requests"
  on public.verification_requests
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Admins / moderators can update (approve/reject)
drop policy if exists "Staff update verification requests" on public.verification_requests;
create policy "Staff update verification requests"
  on public.verification_requests
  for update
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));
