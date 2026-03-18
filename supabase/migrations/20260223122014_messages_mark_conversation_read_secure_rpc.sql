set check_function_bodies = off;

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
$function$
;

revoke execute on function public.mark_conversation_read_secure(uuid) from anon;
revoke all on function public.mark_conversation_read_secure(uuid) from public;
grant execute on function public.mark_conversation_read_secure(uuid) to authenticated;
grant execute on function public.mark_conversation_read_secure(uuid) to service_role;
