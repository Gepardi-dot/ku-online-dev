set check_function_bodies = off;

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
$function$
;

revoke execute on function public.list_conversation_summaries_secure() from anon;
revoke all on function public.list_conversation_summaries_secure() from public;
grant execute on function public.list_conversation_summaries_secure() to authenticated;
grant execute on function public.list_conversation_summaries_secure() to service_role;

revoke execute on function public.list_conversation_summaries(uuid) from anon;
revoke all on function public.list_conversation_summaries(uuid) from public;
revoke execute on function public.list_conversation_summaries(uuid) from authenticated;
grant execute on function public.list_conversation_summaries(uuid) to service_role;
