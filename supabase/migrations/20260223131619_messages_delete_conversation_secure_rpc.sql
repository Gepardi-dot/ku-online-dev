set check_function_bodies = off;

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
$function$
;

revoke execute on function public.delete_conversation_secure(uuid) from anon;
revoke all on function public.delete_conversation_secure(uuid) from public;
grant execute on function public.delete_conversation_secure(uuid) to authenticated;
grant execute on function public.delete_conversation_secure(uuid) to service_role;
