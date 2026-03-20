set check_function_bodies = off;

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
$function$
;

revoke execute on function public.delete_message_secure(uuid) from anon;
revoke all on function public.delete_message_secure(uuid) from public;
grant execute on function public.delete_message_secure(uuid) to authenticated;
grant execute on function public.delete_message_secure(uuid) to service_role;
