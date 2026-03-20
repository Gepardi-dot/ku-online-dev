set check_function_bodies = off;

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
$function$
;

revoke execute on function public.get_conversation_detail_secure(uuid) from anon;
revoke all on function public.get_conversation_detail_secure(uuid) from public;
grant execute on function public.get_conversation_detail_secure(uuid) to authenticated;
grant execute on function public.get_conversation_detail_secure(uuid) to service_role;
