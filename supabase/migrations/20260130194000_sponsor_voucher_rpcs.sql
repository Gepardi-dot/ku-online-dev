-- Sponsor voucher RPCs (MVP)
-- Security model:
-- - Claims/redeems are performed via SECURITY DEFINER RPCs with explicit checks.
-- - Direct table writes are intentionally restricted by RLS (no insert/update policies on claims/redemptions).
set search_path = public;

create or replace function public.claim_sponsor_voucher(p_offer_id uuid)
returns table (
  claim_id uuid,
  code text,
  expires_at timestamptz,
  store_id uuid,
  store_slug text,
  store_name text,
  offer_id uuid,
  offer_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := timezone('utc', now());
  v_offer record;
  v_claim_count integer := 0;
  v_redemption_count integer := 0;
  v_total_redemptions integer := 0;
  v_expires_at timestamptz;
  v_code text;
  v_claim_id uuid;
  attempts integer := 0;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select
    o.id as offer_id,
    o.store_id as store_id,
    o.title as offer_title,
    o.status as offer_status,
    o.start_at as start_at,
    o.end_at as end_at,
    o.max_claims_per_user as max_claims_per_user,
    o.max_redemptions_per_user as max_redemptions_per_user,
    o.max_total_redemptions as max_total_redemptions,
    s.slug as store_slug,
    s.name as store_name,
    s.status as store_status
  into v_offer
  from public.sponsor_offers o
  join public.sponsor_stores s on s.id = o.store_id
  where o.id = p_offer_id
  limit 1;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if v_offer.store_status <> 'active' then
    raise exception 'STORE_DISABLED';
  end if;

  if v_offer.offer_status <> 'active' then
    raise exception 'OFFER_NOT_ACTIVE';
  end if;

  if v_offer.start_at > v_now or (v_offer.end_at is not null and v_offer.end_at <= v_now) then
    raise exception 'OFFER_EXPIRED';
  end if;

  select count(*) into v_claim_count
  from public.sponsor_voucher_claims c
  where c.offer_id = p_offer_id
    and c.user_id = v_user_id
    and c.status in ('claimed', 'redeemed');

  if v_claim_count >= greatest(1, v_offer.max_claims_per_user) then
    raise exception 'CLAIM_LIMIT_REACHED';
  end if;

  select count(*) into v_redemption_count
  from public.sponsor_redemptions r
  join public.sponsor_voucher_claims c on c.id = r.claim_id
  where r.offer_id = p_offer_id
    and c.user_id = v_user_id;

  if v_redemption_count >= greatest(1, v_offer.max_redemptions_per_user) then
    raise exception 'REDEMPTION_LIMIT_REACHED';
  end if;

  if v_offer.max_total_redemptions is not null then
    select count(*) into v_total_redemptions
    from public.sponsor_redemptions r
    where r.offer_id = p_offer_id;

    if v_total_redemptions >= v_offer.max_total_redemptions then
      raise exception 'OFFER_SOLD_OUT';
    end if;
  end if;

  v_expires_at := coalesce(v_offer.end_at, v_now + interval '30 days');

  loop
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'FAILED_TO_GENERATE_CODE';
    end if;

    v_code := encode(gen_random_bytes(5), 'base32');

    begin
      insert into public.sponsor_voucher_claims (
        offer_id,
        store_id,
        user_id,
        code,
        status,
        expires_at
      )
      values (
        p_offer_id,
        v_offer.store_id,
        v_user_id,
        v_code,
        'claimed',
        v_expires_at
      )
      returning id into v_claim_id;

      insert into public.sponsor_audit_logs (actor_id, action, entity_type, entity_id, metadata)
      values (
        v_user_id,
        'voucher.claimed',
        'sponsor_offer',
        p_offer_id,
        jsonb_build_object(
          'claim_id', v_claim_id,
          'store_id', v_offer.store_id
        )
      );

      exit;
    exception
      when unique_violation then
        -- Code collision (very unlikely); retry.
        null;
    end;
  end loop;

  claim_id := v_claim_id;
  code := v_code;
  expires_at := v_expires_at;
  store_id := v_offer.store_id;
  store_slug := v_offer.store_slug;
  store_name := v_offer.store_name;
  offer_id := p_offer_id;
  offer_title := v_offer.offer_title;
  return next;
end;
$$;

revoke execute on function public.claim_sponsor_voucher(uuid) from public;
grant execute on function public.claim_sponsor_voucher(uuid) to authenticated;

create or replace function public.redeem_sponsor_voucher(p_store_id uuid, p_code text)
returns table (
  redemption_id uuid,
  claim_id uuid,
  redeemed_at timestamptz,
  store_id uuid,
  offer_id uuid,
  offer_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_user_id uuid := auth.uid();
  v_now timestamptz := timezone('utc', now());
  v_code text;
  v_claim record;
  v_offer record;
  v_is_staff boolean := false;
  v_total_redemptions integer := 0;
  v_user_redemptions integer := 0;
  v_redemption_id uuid;
begin
  if v_staff_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select exists (
    select 1
    from public.sponsor_store_staff ss
    where ss.store_id = p_store_id
      and ss.user_id = v_staff_user_id
      and ss.status = 'active'
  ) into v_is_staff;

  if not v_is_staff then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_code) < 6 then
    raise exception 'INVALID_CODE';
  end if;

  select
    c.id,
    c.offer_id,
    c.store_id,
    c.user_id,
    c.status,
    c.expires_at,
    c.redeemed_at
  into v_claim
  from public.sponsor_voucher_claims c
  where c.code = v_code
    and c.store_id = p_store_id
  limit 1
  for update;

  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;

  if v_claim.status = 'redeemed' then
    raise exception 'ALREADY_REDEEMED';
  end if;

  if v_claim.status <> 'claimed' then
    raise exception 'NOT_REDEEMABLE';
  end if;

  if v_claim.expires_at is not null and v_claim.expires_at <= v_now then
    update public.sponsor_voucher_claims
    set status = 'expired'
    where id = v_claim.id;
    raise exception 'VOUCHER_EXPIRED';
  end if;

  -- Lock the offer row to keep max-total enforcement concurrency-safe.
  select
    o.id as offer_id,
    o.store_id as offer_store_id,
    o.title as offer_title,
    o.status as offer_status,
    o.start_at as start_at,
    o.end_at as end_at,
    o.max_total_redemptions as max_total_redemptions,
    o.max_redemptions_per_user as max_redemptions_per_user,
    s.status as store_status
  into v_offer
  from public.sponsor_offers o
  join public.sponsor_stores s on s.id = o.store_id
  where o.id = v_claim.offer_id
  limit 1
  for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if v_offer.offer_store_id <> v_claim.store_id then
    raise exception 'INVALID_CLAIM';
  end if;

  if v_offer.store_status <> 'active' then
    raise exception 'STORE_DISABLED';
  end if;

  if v_offer.offer_status <> 'active' or v_offer.start_at > v_now or (v_offer.end_at is not null and v_offer.end_at <= v_now) then
    update public.sponsor_voucher_claims
    set status = 'expired'
    where id = v_claim.id;
    raise exception 'OFFER_EXPIRED';
  end if;

  -- Enforce per-user redemption limits against the voucher owner (not the staff member).
  select count(*) into v_user_redemptions
  from public.sponsor_redemptions r
  join public.sponsor_voucher_claims c2 on c2.id = r.claim_id
  where r.offer_id = v_claim.offer_id
    and c2.user_id = v_claim.user_id;

  if v_user_redemptions >= greatest(1, v_offer.max_redemptions_per_user) then
    raise exception 'REDEMPTION_LIMIT_REACHED';
  end if;

  if v_offer.max_total_redemptions is not null then
    select count(*) into v_total_redemptions
    from public.sponsor_redemptions r
    where r.offer_id = v_claim.offer_id;

    if v_total_redemptions >= v_offer.max_total_redemptions then
      raise exception 'OFFER_SOLD_OUT';
    end if;
  end if;

  insert into public.sponsor_redemptions (
    claim_id,
    store_id,
    offer_id,
    staff_user_id,
    redeemed_at,
    method
  )
  values (
    v_claim.id,
    v_claim.store_id,
    v_claim.offer_id,
    v_staff_user_id,
    v_now,
    'code_entry'
  )
  returning id into v_redemption_id;

  update public.sponsor_voucher_claims
  set status = 'redeemed',
      redeemed_at = v_now,
      redemption_id = v_redemption_id
  where id = v_claim.id;

  insert into public.sponsor_audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_staff_user_id,
    'voucher.redeemed',
    'sponsor_voucher_claim',
    v_claim.id,
    jsonb_build_object(
      'redemption_id', v_redemption_id,
      'store_id', v_claim.store_id,
      'offer_id', v_claim.offer_id
    )
  );

  redemption_id := v_redemption_id;
  claim_id := v_claim.id;
  redeemed_at := v_now;
  store_id := v_claim.store_id;
  offer_id := v_claim.offer_id;
  offer_title := v_offer.offer_title;
  return next;
end;
$$;

revoke execute on function public.redeem_sponsor_voucher(uuid, text) from public;
grant execute on function public.redeem_sponsor_voucher(uuid, text) to authenticated;
