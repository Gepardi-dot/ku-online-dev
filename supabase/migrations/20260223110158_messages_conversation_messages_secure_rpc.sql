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
$function$
;

revoke execute on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) from anon;
revoke all on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) from public;
grant execute on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) to authenticated;
grant execute on function public.list_conversation_messages_secure(uuid, timestamp with time zone, integer) to service_role;
