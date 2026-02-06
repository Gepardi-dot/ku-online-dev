-- Normalize voucher codes so staff can redeem using cleaned input.
-- Ensures codes are stored uppercase A-Z0-9 with no padding characters.
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

    v_code := upper(regexp_replace(replace(encode(gen_random_bytes(6), 'base32'), '=', ''), '[^A-Z0-9]', '', 'g'));

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

