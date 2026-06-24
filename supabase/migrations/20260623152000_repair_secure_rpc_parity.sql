set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.list_conversation_messages_secure(p_conversation_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, receiver_id uuid, product_id uuid, content text, is_read boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_limit integer;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.seller_id = v_uid or c.buyer_id = v_uid)
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  v_limit := greatest(10, least(coalesce(p_limit, 50), 200));

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.receiver_id,
    m.product_id,
    m.content,
    m.is_read,
    m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit v_limit;
end;
$function$;

revoke execute on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) from anon;
revoke all on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) from public;
grant execute on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) to authenticated;
grant execute on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) to service_role;

CREATE OR REPLACE FUNCTION public.get_conversation_detail_secure(p_conversation_id uuid)
 RETURNS TABLE(id uuid, product_id uuid, seller_id uuid, buyer_id uuid, last_message text, last_message_at timestamp with time zone, updated_at timestamp with time zone, product_title text, product_price numeric, product_currency character varying, product_image text, seller_full_name text, seller_avatar_url text, buyer_full_name text, buyer_avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  images_is_jsonb boolean := false;
  image_expr text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.conversations c where c.id = p_conversation_id
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.seller_id = v_uid or c.buyer_id = v_uid)
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select (a.atttypid::regtype = 'jsonb'::regtype)
    into images_is_jsonb
  from pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attname = 'images'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  image_expr := case when images_is_jsonb then '(p.images ->> 0)' else '(p.images[1])' end;

  return query execute format($fmt$
    select
      c.id,
      c.product_id,
      c.seller_id,
      c.buyer_id,
      c.last_message,
      c.last_message_at,
      c.updated_at,
      p.title as product_title,
      p.price as product_price,
      p.currency::varchar as product_currency,
      %s as product_image,
      s.full_name as seller_full_name,
      s.avatar_url as seller_avatar_url,
      b.full_name as buyer_full_name,
      b.avatar_url as buyer_avatar_url
    from public.conversations c
    left join public.products p on p.id = c.product_id
    left join public.public_user_profiles s on s.id = c.seller_id
    left join public.public_user_profiles b on b.id = c.buyer_id
    where c.id = $1
    limit 1
  $fmt$, image_expr)
  using p_conversation_id;
end;
$function$;

revoke execute on function public.get_conversation_detail_secure(uuid) from anon;
revoke all on function public.get_conversation_detail_secure(uuid) from public;
grant execute on function public.get_conversation_detail_secure(uuid) to authenticated;
grant execute on function public.get_conversation_detail_secure(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.list_conversation_summaries_secure()
 RETURNS TABLE(id uuid, product_id uuid, seller_id uuid, buyer_id uuid, last_message text, last_message_at timestamp with time zone, updated_at timestamp with time zone, unread_count integer, product_title text, product_price numeric, product_currency character varying, product_image text, seller_full_name text, seller_avatar_url text, buyer_full_name text, buyer_avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  images_is_jsonb boolean := false;
  image_expr text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  select (a.atttypid::regtype = 'jsonb'::regtype)
    into images_is_jsonb
  from pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attname = 'images'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  image_expr := case when images_is_jsonb then '(p.images ->> 0)' else '(p.images[1])' end;

  return query execute format($fmt$
    select
      c.id,
      c.product_id,
      c.seller_id,
      c.buyer_id,
      c.last_message,
      c.last_message_at,
      c.updated_at,
      coalesce(u.unread_count, 0)::int as unread_count,
      p.title as product_title,
      p.price as product_price,
      p.currency::varchar as product_currency,
      %s as product_image,
      s.full_name as seller_full_name,
      s.avatar_url as seller_avatar_url,
      b.full_name as buyer_full_name,
      b.avatar_url as buyer_avatar_url
    from public.conversations c
    left join public.products p on p.id = c.product_id
    left join public.public_user_profiles s on s.id = c.seller_id
    left join public.public_user_profiles b on b.id = c.buyer_id
    left join (
      select
        conversation_id,
        count(*)::int as unread_count
      from public.messages
      where receiver_id = $1
        and is_read = false
      group by conversation_id
    ) u on u.conversation_id = c.id
    where c.seller_id = $1
       or c.buyer_id = $1
    order by c.updated_at desc nulls last
  $fmt$, image_expr)
  using v_uid;
end;
$function$;

revoke execute on function public.list_conversation_summaries_secure() from anon;
revoke all on function public.list_conversation_summaries_secure() from public;
grant execute on function public.list_conversation_summaries_secure() to authenticated;
grant execute on function public.list_conversation_summaries_secure() to service_role;

do $$
begin
  if to_regprocedure('public.list_conversation_summaries(uuid)') is not null then
    revoke execute on function public.list_conversation_summaries(uuid) from anon;
    revoke all on function public.list_conversation_summaries(uuid) from public;
    revoke execute on function public.list_conversation_summaries(uuid) from authenticated;
    grant execute on function public.list_conversation_summaries(uuid) to service_role;
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read_secure(p_conversation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_updated_count integer := 0;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.seller_id = v_uid or c.buyer_id = v_uid)
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  update public.messages m
  set is_read = true
  where m.conversation_id = p_conversation_id
    and m.receiver_id = v_uid
    and coalesce(m.is_read, false) = false;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$function$;

revoke execute on function public.mark_conversation_read_secure(uuid) from anon;
revoke all on function public.mark_conversation_read_secure(uuid) from public;
grant execute on function public.mark_conversation_read_secure(uuid) to authenticated;
grant execute on function public.mark_conversation_read_secure(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.delete_message_secure(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_sender_id uuid;
  v_conversation_id uuid;
  v_latest_content text;
  v_latest_created_at timestamptz;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  select m.sender_id, m.conversation_id
    into v_sender_id, v_conversation_id
  from public.messages m
  where m.id = p_message_id
  limit 1;

  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;

  if v_sender_id is distinct from v_uid then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  delete from public.messages
  where id = p_message_id
    and sender_id = v_uid;

  if not found then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;

  begin
    select m.content, m.created_at
      into v_latest_content, v_latest_created_at
    from public.messages m
    where m.conversation_id = v_conversation_id
    order by m.created_at desc
    limit 1;

    update public.conversations c
    set last_message = v_latest_content,
        last_message_at = v_latest_created_at
    where c.id = v_conversation_id;
  exception when others then
    null;
  end;

  return true;
end;
$function$;

revoke execute on function public.delete_message_secure(uuid) from anon;
revoke all on function public.delete_message_secure(uuid) from public;
grant execute on function public.delete_message_secure(uuid) to authenticated;
grant execute on function public.delete_message_secure(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.delete_conversation_secure(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  delete from public.conversations c
  where c.id = p_conversation_id
    and (c.seller_id = v_uid or c.buyer_id = v_uid);

  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return true;
end;
$function$;

revoke execute on function public.delete_conversation_secure(uuid) from anon;
revoke all on function public.delete_conversation_secure(uuid) from public;
grant execute on function public.delete_conversation_secure(uuid) to authenticated;
grant execute on function public.delete_conversation_secure(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_algolia_product_row_secure(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_role text;
  v_seller_id uuid;
  v_row jsonb;
  has_listing_type boolean := false;
  has_rental_term boolean := false;
  listing_type_expr text;
  rental_term_expr text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  v_role := coalesce(auth.jwt() ->> 'role', '');

  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.products'::regclass
      and a.attname = 'listing_type'
      and a.attnum > 0
      and not a.attisdropped
  ) into has_listing_type;

  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.products'::regclass
      and a.attname = 'rental_term'
      and a.attnum > 0
      and not a.attisdropped
  ) into has_rental_term;

  listing_type_expr := case when has_listing_type then 'p.listing_type' else '''sale''::text' end;
  rental_term_expr := case when has_rental_term then 'p.rental_term' else 'null::text' end;

  execute format($fmt$
  select
    p.seller_id,
    jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'description', p.description,
      'title_translations', p.title_translations,
      'description_translations', p.description_translations,
      'price', p.price,
      'original_price', p.original_price,
      'currency', p.currency,
      'condition', p.condition,
      'listing_type', %s,
      'rental_term', %s,
      'color_token', p.color_token,
      'category_id', p.category_id,
      'seller_id', p.seller_id,
      'location', p.location,
      'images', p.images,
      'is_active', p.is_active,
      'is_sold', p.is_sold,
      'is_promoted', p.is_promoted,
      'views', p.views,
      'created_at', p.created_at,
      'expires_at', p.expires_at,
      'updated_at', p.updated_at,
      'category',
        case
          when c.id is null then null
          else jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'name_ar', c.name_ar,
            'name_ku', c.name_ku
          )
        end,
      'seller',
        case
          when u.id is null then null
          else jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'full_name', u.full_name,
            'name', u.name,
            'avatar_url', u.avatar_url,
            'is_verified', u.is_verified
          )
        end
    )
  into v_seller_id, v_row
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.users u on u.id = p.seller_id
  where p.id = $1
  $fmt$, listing_type_expr, rental_term_expr)
  into v_seller_id, v_row
  using p_product_id;

  if v_row is null then
    return null;
  end if;

  if v_seller_id is distinct from v_uid and v_role not in ('admin', 'moderator') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return v_row;
end;
$function$;

revoke execute on function public.get_algolia_product_row_secure(uuid) from anon;
revoke all on function public.get_algolia_product_row_secure(uuid) from public;
grant execute on function public.get_algolia_product_row_secure(uuid) to authenticated;
grant execute on function public.get_algolia_product_row_secure(uuid) to service_role;
