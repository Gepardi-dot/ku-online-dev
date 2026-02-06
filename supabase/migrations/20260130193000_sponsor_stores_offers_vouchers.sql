-- Sponsor Stores + Vouchers (MVP)
-- Cash-first: "Show this code" vouchers, redeemed in-store by staff.
set search_path = public;

-- Stores ---------------------------------------------------------------------
create table if not exists public.sponsor_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  logo_url text,
  cover_url text,
  primary_city text,
  phone text,
  whatsapp text,
  website text,
  status text not null default 'pending',
  sponsor_tier text not null default 'basic',
  is_featured boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_stores_name_len check (char_length(name) between 2 and 140),
  constraint sponsor_stores_slug_len check (char_length(slug) between 2 and 80),
  constraint sponsor_stores_slug_unique unique (slug),
  constraint sponsor_stores_description_len check (description is null or char_length(description) <= 4000),
  constraint sponsor_stores_logo_url_len check (logo_url is null or char_length(logo_url) <= 1024),
  constraint sponsor_stores_cover_url_len check (cover_url is null or char_length(cover_url) <= 1024),
  constraint sponsor_stores_city_len check (primary_city is null or char_length(primary_city) <= 40),
  constraint sponsor_stores_phone_len check (phone is null or char_length(phone) <= 40),
  constraint sponsor_stores_whatsapp_len check (whatsapp is null or char_length(whatsapp) <= 40),
  constraint sponsor_stores_website_len check (website is null or char_length(website) <= 512),
  constraint sponsor_stores_status_check check (status in ('pending', 'active', 'disabled')),
  constraint sponsor_stores_tier_check check (sponsor_tier in ('basic', 'featured'))
);

create index if not exists idx_sponsor_stores_status_city
  on public.sponsor_stores (status, primary_city, is_featured, updated_at desc);

drop trigger if exists trg_sponsor_stores_touch_updated_at on public.sponsor_stores;
create trigger trg_sponsor_stores_touch_updated_at
  before update on public.sponsor_stores
  for each row
  execute procedure public.touch_updated_at();

alter table public.sponsor_stores enable row level security;

drop policy if exists "Public read active sponsor stores" on public.sponsor_stores;
create policy "Public read active sponsor stores"
  on public.sponsor_stores
  for select
  using (status = 'active');

drop policy if exists "Staff read sponsor stores" on public.sponsor_stores;
create policy "Staff read sponsor stores"
  on public.sponsor_stores
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

drop policy if exists "Staff manage sponsor stores" on public.sponsor_stores;
create policy "Staff manage sponsor stores"
  on public.sponsor_stores
  for all
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Store locations (branches) --------------------------------------------------
create table if not exists public.sponsor_store_locations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  city text,
  address text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  opening_hours jsonb,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_store_locations_city_len check (city is null or char_length(city) <= 40),
  constraint sponsor_store_locations_address_len check (address is null or char_length(address) <= 512),
  constraint sponsor_store_locations_phone_len check (phone is null or char_length(phone) <= 40),
  constraint sponsor_store_locations_lat_range check (lat is null or (lat >= -90 and lat <= 90)),
  constraint sponsor_store_locations_lng_range check (lng is null or (lng >= -180 and lng <= 180))
);

create index if not exists idx_sponsor_store_locations_store_city
  on public.sponsor_store_locations (store_id, city);

create unique index if not exists idx_sponsor_store_locations_primary
  on public.sponsor_store_locations (store_id)
  where is_primary;

drop trigger if exists trg_sponsor_store_locations_touch_updated_at on public.sponsor_store_locations;
create trigger trg_sponsor_store_locations_touch_updated_at
  before update on public.sponsor_store_locations
  for each row
  execute procedure public.touch_updated_at();

alter table public.sponsor_store_locations enable row level security;

drop policy if exists "Public read sponsor store locations" on public.sponsor_store_locations;
create policy "Public read sponsor store locations"
  on public.sponsor_store_locations
  for select
  using (
    exists (
      select 1
      from public.sponsor_stores s
      where s.id = sponsor_store_locations.store_id
        and s.status = 'active'
    )
  );

drop policy if exists "Staff read sponsor store locations" on public.sponsor_store_locations;
create policy "Staff read sponsor store locations"
  on public.sponsor_store_locations
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

drop policy if exists "Staff manage sponsor store locations" on public.sponsor_store_locations;
create policy "Staff manage sponsor store locations"
  on public.sponsor_store_locations
  for all
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Store categories (reuse marketplace categories) -----------------------------
create table if not exists public.sponsor_store_categories (
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (store_id, category_id)
);

create index if not exists idx_sponsor_store_categories_category
  on public.sponsor_store_categories (category_id, store_id);

alter table public.sponsor_store_categories enable row level security;

drop policy if exists "Public read sponsor store categories" on public.sponsor_store_categories;
create policy "Public read sponsor store categories"
  on public.sponsor_store_categories
  for select
  using (
    exists (
      select 1
      from public.sponsor_stores s
      where s.id = sponsor_store_categories.store_id
        and s.status = 'active'
    )
  );

drop policy if exists "Staff manage sponsor store categories" on public.sponsor_store_categories;
create policy "Staff manage sponsor store categories"
  on public.sponsor_store_categories
  for all
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Offers ---------------------------------------------------------------------
create table if not exists public.sponsor_offers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  title text not null,
  description text,
  terms text,
  start_at timestamptz not null default timezone('utc', now()),
  end_at timestamptz,
  discount_type text not null default 'custom',
  discount_value numeric,
  currency text,
  status text not null default 'active',
  is_featured boolean not null default false,
  max_claims_per_user integer not null default 1,
  max_redemptions_per_user integer not null default 1,
  max_total_redemptions integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_offers_title_len check (char_length(title) between 2 and 200),
  constraint sponsor_offers_description_len check (description is null or char_length(description) <= 4000),
  constraint sponsor_offers_terms_len check (terms is null or char_length(terms) <= 4000),
  constraint sponsor_offers_discount_type_check check (discount_type in ('percent', 'amount', 'freebie', 'custom')),
  constraint sponsor_offers_currency_len check (currency is null or char_length(currency) <= 8),
  constraint sponsor_offers_status_check check (status in ('draft', 'active', 'paused', 'expired', 'archived')),
  constraint sponsor_offers_limits_positive check (
    max_claims_per_user >= 1
    and max_redemptions_per_user >= 1
    and (max_total_redemptions is null or max_total_redemptions >= 1)
  ),
  constraint sponsor_offers_end_after_start check (end_at is null or end_at > start_at)
);

create index if not exists idx_sponsor_offers_store_status_end
  on public.sponsor_offers (store_id, status, end_at desc);

create index if not exists idx_sponsor_offers_featured
  on public.sponsor_offers (is_featured, status, end_at desc);

drop trigger if exists trg_sponsor_offers_touch_updated_at on public.sponsor_offers;
create trigger trg_sponsor_offers_touch_updated_at
  before update on public.sponsor_offers
  for each row
  execute procedure public.touch_updated_at();

alter table public.sponsor_offers enable row level security;

drop policy if exists "Public read active sponsor offers" on public.sponsor_offers;
create policy "Public read active sponsor offers"
  on public.sponsor_offers
  for select
  using (
    status = 'active'
    and start_at <= timezone('utc', now())
    and (end_at is null or end_at > timezone('utc', now()))
    and exists (
      select 1
      from public.sponsor_stores s
      where s.id = sponsor_offers.store_id
        and s.status = 'active'
    )
  );

drop policy if exists "Staff read sponsor offers" on public.sponsor_offers;
create policy "Staff read sponsor offers"
  on public.sponsor_offers
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

drop policy if exists "Staff manage sponsor offers" on public.sponsor_offers;
create policy "Staff manage sponsor offers"
  on public.sponsor_offers
  for all
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Voucher claims (wallet) ----------------------------------------------------
create table if not exists public.sponsor_voucher_claims (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.sponsor_offers(id) on delete cascade,
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  code text not null,
  status text not null default 'claimed',
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_voucher_claims_code_len check (char_length(code) between 6 and 16),
  constraint sponsor_voucher_claims_status_check check (status in ('claimed', 'redeemed', 'expired', 'void')),
  constraint sponsor_voucher_claims_code_unique unique (code),
  constraint sponsor_voucher_claims_redeemed_consistency check (
    (status <> 'redeemed') or (redeemed_at is not null)
  )
);

create index if not exists idx_sponsor_voucher_claims_user_status
  on public.sponsor_voucher_claims (user_id, status, created_at desc);

create index if not exists idx_sponsor_voucher_claims_offer_user
  on public.sponsor_voucher_claims (offer_id, user_id);

drop trigger if exists trg_sponsor_voucher_claims_touch_updated_at on public.sponsor_voucher_claims;
create trigger trg_sponsor_voucher_claims_touch_updated_at
  before update on public.sponsor_voucher_claims
  for each row
  execute procedure public.touch_updated_at();

alter table public.sponsor_voucher_claims enable row level security;

drop policy if exists "Users read own sponsor voucher claims" on public.sponsor_voucher_claims;
create policy "Users read own sponsor voucher claims"
  on public.sponsor_voucher_claims
  for select
  using (auth.uid() = user_id);

-- Store staff (partner accounts) ---------------------------------------------
create table if not exists public.sponsor_store_staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'cashier',
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_store_staff_role_check check (role in ('manager', 'cashier')),
  constraint sponsor_store_staff_status_check check (status in ('active', 'disabled')),
  constraint sponsor_store_staff_unique unique (store_id, user_id)
);

create index if not exists idx_sponsor_store_staff_user
  on public.sponsor_store_staff (user_id, status);

drop trigger if exists trg_sponsor_store_staff_touch_updated_at on public.sponsor_store_staff;
create trigger trg_sponsor_store_staff_touch_updated_at
  before update on public.sponsor_store_staff
  for each row
  execute procedure public.touch_updated_at();

alter table public.sponsor_store_staff enable row level security;

drop policy if exists "Users read own sponsor staff memberships" on public.sponsor_store_staff;
create policy "Users read own sponsor staff memberships"
  on public.sponsor_store_staff
  for select
  using (auth.uid() = user_id);

drop policy if exists "Staff manage sponsor store staff" on public.sponsor_store_staff;
create policy "Staff manage sponsor store staff"
  on public.sponsor_store_staff
  for all
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Allow store staff to see their store record even if not publicly active.
drop policy if exists "Sponsor staff read their store" on public.sponsor_stores;
create policy "Sponsor staff read their store"
  on public.sponsor_stores
  for select
  using (
    exists (
      select 1
      from public.sponsor_store_staff ss
      where ss.store_id = sponsor_stores.id
        and ss.user_id = auth.uid()
        and ss.status = 'active'
    )
  );

-- Redemptions ----------------------------------------------------------------
create table if not exists public.sponsor_redemptions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.sponsor_voucher_claims(id) on delete cascade,
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  offer_id uuid not null references public.sponsor_offers(id) on delete cascade,
  staff_user_id uuid not null references public.users(id) on delete restrict,
  redeemed_at timestamptz not null default timezone('utc', now()),
  method text not null default 'code_entry',
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_redemptions_claim_unique unique (claim_id),
  constraint sponsor_redemptions_method_check check (method in ('code_entry', 'qr_scan')),
  constraint sponsor_redemptions_note_len check (note is null or char_length(note) <= 2000)
);

create index if not exists idx_sponsor_redemptions_store_redeemed_at
  on public.sponsor_redemptions (store_id, redeemed_at desc);

create index if not exists idx_sponsor_redemptions_offer_redeemed_at
  on public.sponsor_redemptions (offer_id, redeemed_at desc);

alter table public.sponsor_redemptions enable row level security;

drop policy if exists "Sponsor staff read redemptions for their store" on public.sponsor_redemptions;
create policy "Sponsor staff read redemptions for their store"
  on public.sponsor_redemptions
  for select
  using (
    exists (
      select 1
      from public.sponsor_store_staff ss
      where ss.store_id = sponsor_redemptions.store_id
        and ss.user_id = auth.uid()
        and ss.status = 'active'
    )
  );

drop policy if exists "Staff read sponsor redemptions" on public.sponsor_redemptions;
create policy "Staff read sponsor redemptions"
  on public.sponsor_redemptions
  for select
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Reports --------------------------------------------------------------------
create table if not exists public.sponsor_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  store_id uuid not null references public.sponsor_stores(id) on delete cascade,
  offer_id uuid references public.sponsor_offers(id) on delete set null,
  claim_id uuid references public.sponsor_voucher_claims(id) on delete set null,
  type text not null,
  message text,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_reports_type_check check (type in ('refused_discount', 'misleading_offer', 'closed_store', 'other')),
  constraint sponsor_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint sponsor_reports_message_len check (message is null or char_length(message) <= 2000)
);

create index if not exists idx_sponsor_reports_store_status_created
  on public.sponsor_reports (store_id, status, created_at desc);

create index if not exists idx_sponsor_reports_reporter_created
  on public.sponsor_reports (reporter_id, created_at desc);

drop trigger if exists trg_sponsor_reports_touch_updated_at on public.sponsor_reports;
create trigger trg_sponsor_reports_touch_updated_at
  before update on public.sponsor_reports
  for each row
  execute procedure public.touch_updated_at();

alter table public.sponsor_reports enable row level security;

drop policy if exists "Users create sponsor reports" on public.sponsor_reports;
create policy "Users create sponsor reports"
  on public.sponsor_reports
  for insert
  with check (
    auth.uid() = reporter_id
    and (
      claim_id is null
      or exists (
        select 1
        from public.sponsor_voucher_claims c
        where c.id = sponsor_reports.claim_id
          and c.user_id = auth.uid()
          and c.store_id = sponsor_reports.store_id
      )
    )
  );

drop policy if exists "Users read own sponsor reports" on public.sponsor_reports;
create policy "Users read own sponsor reports"
  on public.sponsor_reports
  for select
  using (auth.uid() = reporter_id);

drop policy if exists "Staff manage sponsor reports" on public.sponsor_reports;
create policy "Staff manage sponsor reports"
  on public.sponsor_reports
  for all
  using ((auth.jwt() ->> 'role') in ('admin', 'moderator'))
  with check ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

-- Sponsor audit log (private by default) -------------------------------------
create table if not exists public.sponsor_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sponsor_audit_logs_action_len check (char_length(action) between 2 and 80),
  constraint sponsor_audit_logs_entity_type_len check (char_length(entity_type) between 2 and 80)
);

create index if not exists idx_sponsor_audit_logs_created_at
  on public.sponsor_audit_logs (created_at desc);

create index if not exists idx_sponsor_audit_logs_entity
  on public.sponsor_audit_logs (entity_type, entity_id, created_at desc);

alter table public.sponsor_audit_logs enable row level security;

-- No RLS policies here intentionally: audit logs are written server-side and kept private.

-- Back-reference from claims to redemption record (avoid circular dependency).
alter table public.sponsor_voucher_claims
  add column if not exists redemption_id uuid;

alter table public.sponsor_voucher_claims
  drop constraint if exists sponsor_voucher_claims_redemption_id_fkey;

alter table public.sponsor_voucher_claims
  add constraint sponsor_voucher_claims_redemption_id_fkey
  foreign key (redemption_id)
  references public.sponsor_redemptions(id)
  on delete set null;
