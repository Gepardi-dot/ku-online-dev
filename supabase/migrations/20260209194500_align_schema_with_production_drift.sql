-- Align local/staging schema with the current production baseline.
-- This captures production-side drift that existed outside migration history.

-- Add columns that exist in production but were missing in staging/local.
alter table if exists public.products
  add column if not exists favorites_count integer;

update public.products
set favorites_count = 0
where favorites_count is null;

alter table public.products
  alter column favorites_count set default 0,
  alter column favorites_count set not null;

alter table if exists public.users
  add column if not exists profile_completed boolean,
  add column if not exists profile_visibility text,
  add column if not exists show_profile_on_marketplace boolean;

alter table public.users
  alter column profile_completed set default false,
  alter column profile_visibility set default 'public'::text,
  alter column show_profile_on_marketplace set default true;

-- Normalize data types to match production.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'favorites'
      and column_name = 'created_at'
      and udt_name = 'timestamptz'
  ) then
    alter table public.favorites
      alter column created_at type timestamp without time zone
      using created_at at time zone 'utc';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'created_at'
      and udt_name = 'timestamptz'
  ) then
    alter table public.products
      alter column created_at type timestamp without time zone
      using created_at at time zone 'utc';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'created_at'
      and udt_name = 'timestamptz'
  ) then
    alter table public.users
      alter column created_at type timestamp without time zone
      using created_at at time zone 'utc';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'currency'
      and udt_name = 'varchar'
  ) then
    alter table public.products
      alter column currency type text
      using currency::text;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'email'
      and udt_name = 'varchar'
  ) then
    alter table public.users
      alter column email type text
      using email::text;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'phone'
      and udt_name = 'varchar'
  ) then
    alter table public.users
      alter column phone type text
      using phone::text;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'response_rate'
      and udt_name = 'numeric'
  ) then
    alter table public.users
      alter column response_rate type text
      using response_rate::text;
  end if;
end;
$$;

create or replace function public._tmp_jsonb_to_text_array(payload jsonb)
returns text[]
language plpgsql
immutable
as $function$
begin
  if payload is null then
    return null;
  end if;

  if jsonb_typeof(payload) = 'array' then
    return coalesce(
      (select array_agg(value) from jsonb_array_elements_text(payload) as value),
      '{}'::text[]
    );
  end if;

  if jsonb_typeof(payload) = 'string' then
    return array[trim(both '"' from payload::text)];
  end if;

  return '{}'::text[];
end;
$function$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'images'
      and udt_name = 'jsonb'
  ) then
    drop trigger if exists trg_products_after_update_notify_listing_updated on public.products;
    alter table public.products drop constraint if exists products_images_array;
    alter table public.products drop constraint if exists products_images_max;

    alter table public.products
      alter column images drop default;

    alter table public.products
      alter column images type text[]
      using public._tmp_jsonb_to_text_array(images);
  end if;
end;
$$;

drop function if exists public._tmp_jsonb_to_text_array(jsonb);

do $$
begin
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and tg.tgname = 'trg_products_after_update_notify_listing_updated'
      and not tg.tgisinternal
  ) then
    create trigger trg_products_after_update_notify_listing_updated
      after update of title, description, images on public.products
      for each row execute function public.notify_listing_updated();
  end if;
end;
$$;

-- Align nullability and defaults to production.
alter table public.categories
  alter column created_at drop not null,
  alter column is_active drop not null,
  alter column sort_order drop not null,
  alter column sort_order drop default;

alter table public.favorites
  alter column created_at drop not null;

alter table public.products
  alter column condition drop not null,
  alter column created_at drop not null,
  alter column currency drop not null,
  alter column currency set default 'IQD'::text,
  alter column images drop not null,
  alter column images set default '{}'::text[],
  alter column is_active drop not null,
  alter column is_promoted drop not null,
  alter column is_sold drop not null,
  alter column title drop not null,
  alter column updated_at drop not null,
  alter column views drop not null;

alter table public.users
  alter column created_at drop not null,
  alter column is_verified drop not null,
  alter column rating drop not null,
  alter column rating drop default,
  alter column total_ratings drop not null,
  alter column total_ratings drop default,
  alter column updated_at drop not null;

-- Align constraints with production.
alter table public.abuse_reports
  drop constraint if exists abuse_reports_target_any;

alter table public.abuse_reports
  add constraint abuse_reports_target_any
  check (
    ((product_id is not null)::integer
    + (message_id is not null)::integer
    + (reported_user_id is not null)::integer) >= 1
  );

alter table public.products
  drop constraint if exists products_seller_id_fkey;

alter table public.products
  add constraint products_seller_id_fkey
  foreign key (seller_id)
  references public.users(id)
  on delete cascade;

alter table public.favorites
  drop constraint if exists favorites_user_product_unique;

alter table public.products
  drop constraint if exists products_active_seller_required,
  drop constraint if exists products_condition_check,
  drop constraint if exists products_currency_check,
  drop constraint if exists products_views_non_negative;

alter table public.reviews
  drop constraint if exists reviews_buyer_product_unique,
  drop constraint if exists reviews_no_self_review;

drop trigger if exists trg_reviews_product_seller_match on public.reviews;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_content_length_bounds'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_content_length_bounds
      check (char_length(content) >= 1 and char_length(content) <= 1000);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_condition_allowed_values'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_condition_allowed_values
      check (condition = any (array['New'::text, 'Used - Like New'::text, 'Used - Good'::text, 'Used - Fair'::text]));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_currency_format'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_currency_format
      check (char_length(currency) = 3 and currency = upper(currency));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_description_max_length'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_description_max_length
      check (description is null or char_length(description) <= 5000);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_title_length'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_title_length
      check (char_length(title) >= 1 and char_length(title) <= 200);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_comment_max_length'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_comment_max_length
      check (comment is null or char_length(comment) <= 2000);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_profile_visibility_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_profile_visibility_check
      check (profile_visibility = any (array['public'::text, 'community'::text, 'private'::text]));
  end if;
end;
$$;

-- Restore production audit table and policies.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  event_type text not null,
  context jsonb not null default '{}'::jsonb,
  ip text null,
  user_agent text null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audit_events_user_id_fkey'
      and conrelid = 'public.audit_events'::regclass
  ) then
    alter table public.audit_events
      add constraint audit_events_user_id_fkey
      foreign key (user_id)
      references public.users(id)
      on delete set null;
  end if;
end;
$$;

alter table public.audit_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_events'
      and policyname = 'Users view own audit events'
  ) then
    create policy "Users view own audit events"
      on public.audit_events
      for select
      using (auth.uid() = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_events'
      and policyname = 'Insert audit events'
  ) then
    create policy "Insert audit events"
      on public.audit_events
      for insert
      with check (auth.uid() = user_id);
  end if;
end;
$$;

-- Restore policies present in production under legacy names.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'favorites'
      and policyname = 'Users can add their own favorites'
  ) then
    create policy "Users can add their own favorites"
      on public.favorites
      for insert
      with check (auth.uid() = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'favorites'
      and policyname = 'Users can remove their own favorites'
  ) then
    create policy "Users can remove their own favorites"
      on public.favorites
      for delete
      using (auth.uid() = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users can view their messages'
  ) then
    create policy "Users can view their messages"
      on public.messages
      for select
      using ((auth.uid() = sender_id) or (auth.uid() = receiver_id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'Anyone can view reviews'
  ) then
    create policy "Anyone can view reviews"
      on public.reviews
      for select
      using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'Buyers can create reviews'
  ) then
    create policy "Buyers can create reviews"
      on public.reviews
      for insert
      with check (auth.uid() = buyer_id);
  end if;
end;
$$;

-- Restore production functions.
create or replace function public.apply_storage_policies()
returns void
language plpgsql
security definer
set search_path to 'storage', 'public'
as $function$
begin
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
end;
$function$;

create or replace function public.log_audit_event(
  p_event_type text,
  p_context jsonb default '{}'::jsonb,
  p_ip text default null::text,
  p_user_agent text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.audit_events (user_id, event_type, context, ip, user_agent)
  values (auth.uid(), p_event_type, coalesce(p_context, '{}'::jsonb), p_ip, p_user_agent);
end;
$function$;

create or replace function public.log_abuse_report_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.log_audit_event(
    'abuse.report.created',
    jsonb_build_object(
      'reportId', new.id,
      'productId', new.product_id,
      'reportedUserId', new.reported_user_id,
      'messageId', new.message_id,
      'status', new.status,
      'isAutoFlagged', new.is_auto_flagged
    )
  );
  return new;
end;
$function$;

create or replace function public.log_user_blocked_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.log_audit_event(
    'user.blocked',
    jsonb_build_object(
      'blockedUserId', new.blocked_user_id,
      'reason', new.reason
    )
  );
  return new;
end;
$function$;

create or replace function public.log_user_unblocked_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.log_audit_event(
    'user.unblocked',
    jsonb_build_object(
      'blockedUserId', old.blocked_user_id
    )
  );
  return old;
end;
$function$;

create or replace function public.notify_favorite_added()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  seller_id uuid;
  product_title text;
  seller_allows_updates boolean;
begin
  select p.seller_id, p.title, coalesce(u.notify_updates, true)
  into seller_id, product_title, seller_allows_updates
  from public.products p
  left join public.users u on u.id = p.seller_id
  where p.id = new.product_id;

  if seller_id is null or seller_id = new.user_id or not coalesce(seller_allows_updates, true) then
    return new;
  end if;

  insert into public.notifications (user_id, title, content, type, related_id, is_read, created_at)
  values (
    seller_id,
    'New favorite on your listing',
    coalesce(product_title, ''),
    'favorite',
    new.product_id,
    false,
    timezone('utc', now())
  );

  return new;
end;
$function$;

create or replace function public.update_product_favorites_count()
returns trigger
language plpgsql
security definer
as $function$
begin
  if (TG_OP = 'INSERT') then
    update public.products
    set favorites_count = favorites_count + 1
    where id = new.product_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.products
    set favorites_count = greatest(0, favorites_count - 1)
    where id = old.product_id;
    return old;
  end if;
  return null;
end;
$function$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'abuse_reports'
      and tg.tgname = 'trg_abuse_reports_audit'
      and not tg.tgisinternal
  ) then
    create trigger trg_abuse_reports_audit
      after insert on public.abuse_reports
      for each row execute function public.log_abuse_report_event();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'blocked_users'
      and tg.tgname = 'trg_blocked_users_audit_insert'
      and not tg.tgisinternal
  ) then
    create trigger trg_blocked_users_audit_insert
      after insert on public.blocked_users
      for each row execute function public.log_user_blocked_event();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'blocked_users'
      and tg.tgname = 'trg_blocked_users_audit_delete'
      and not tg.tgisinternal
  ) then
    create trigger trg_blocked_users_audit_delete
      after delete on public.blocked_users
      for each row execute function public.log_user_unblocked_event();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'favorites'
      and tg.tgname = 'trg_favorites_after_insert'
      and not tg.tgisinternal
  ) then
    create trigger trg_favorites_after_insert
      after insert on public.favorites
      for each row execute function public.notify_favorite_added();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'favorites'
      and tg.tgname = 'trigger_update_favorites_count'
      and not tg.tgisinternal
  ) then
    create trigger trigger_update_favorites_count
      after insert or delete on public.favorites
      for each row execute function public.update_product_favorites_count();
  end if;
end;
$$;

drop function if exists public.enforce_review_product_seller_match();
