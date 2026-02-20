alter table "public"."sponsor_stores" add column "approved_at" timestamp with time zone;

alter table "public"."sponsor_stores" add column "approved_by" uuid;

alter table "public"."sponsor_stores" add column "disabled_at" timestamp with time zone;

alter table "public"."sponsor_stores" add column "disabled_by" uuid;

CREATE INDEX sponsor_stores_status_updated_at_idx ON public.sponsor_stores USING btree (status, updated_at DESC);

alter table "public"."sponsor_stores" add constraint "sponsor_stores_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."sponsor_stores" validate constraint "sponsor_stores_approved_by_fkey";

alter table "public"."sponsor_stores" add constraint "sponsor_stores_disabled_by_fkey" FOREIGN KEY (disabled_by) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."sponsor_stores" validate constraint "sponsor_stores_disabled_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_set_sponsor_store_status(p_store_id uuid, p_status text, p_actor uuid)
 RETURNS TABLE(store_id uuid, status text, approved_at timestamp with time zone, approved_by uuid, disabled_at timestamp with time zone, disabled_by uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_store public.sponsor_stores%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if p_store_id is null then
    raise exception using errcode = 'P0001', message = 'SPONSOR_STORE_NOT_FOUND';
  end if;

  if p_actor is null then
    raise exception using errcode = 'P0001', message = 'SPONSOR_NOT_AUTHORIZED';
  end if;

  if v_status not in ('active', 'disabled') then
    raise exception using errcode = 'P0001', message = 'SPONSOR_INVALID_STATUS_TRANSITION';
  end if;

  select *
  into v_store
  from public.sponsor_stores
  where id = p_store_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'SPONSOR_STORE_NOT_FOUND';
  end if;

  if v_status = 'active' and v_store.owner_user_id is null then
    raise exception using errcode = 'P0001', message = 'SPONSOR_STORE_OWNER_REQUIRED';
  end if;

  if v_status = 'active' then
    update public.sponsor_stores
    set
      status = 'active',
      approved_at = timezone('utc', now()),
      approved_by = p_actor,
      disabled_at = null,
      disabled_by = null
    where id = p_store_id;
  else
    update public.sponsor_stores
    set
      status = 'disabled',
      disabled_at = timezone('utc', now()),
      disabled_by = p_actor
    where id = p_store_id;
  end if;

  insert into public.sponsor_audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    p_actor,
    'sponsor.store.status_changed',
    'sponsor_store',
    p_store_id,
    jsonb_build_object(
      'from_status', v_store.status,
      'to_status', v_status
    )
  );

  return query
  select
    s.id,
    s.status,
    s.approved_at,
    s.approved_by,
    s.disabled_at,
    s.disabled_by
  from public.sponsor_stores s
  where s.id = p_store_id;
end;
$function$
;

revoke all on function public.admin_set_sponsor_store_status(uuid, text, uuid) from public;
grant execute on function public.admin_set_sponsor_store_status(uuid, text, uuid) to service_role;

