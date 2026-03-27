set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_abuse_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  report_threshold integer := 3;
  open_count integer := 0;
  v_product record;
  v_related_id uuid;
begin
  select count(*) into open_count
  from public.abuse_reports
  where status in ('open', 'auto-flagged')
    and (
      (new.product_id is not null and product_id = new.product_id)
      or (new.reported_user_id is not null and reported_user_id = new.reported_user_id)
    );

  if open_count >= report_threshold then
    update public.abuse_reports
    set is_auto_flagged = true,
        status = case when status = 'open' then 'auto-flagged' else status end,
        updated_at = timezone('utc', now())
    where id = new.id;

    if new.product_id is not null then
      select id, seller_id, title, is_active
      into v_product
      from public.products
      where id = new.product_id;

      if found then
        if coalesce(v_product.is_active, true) then
          update public.products
          set is_active = false
          where id = v_product.id;
        end if;

        if v_product.seller_id is not null then
          insert into public.notifications (user_id, title, content, type, related_id)
          values (
            v_product.seller_id,
            'Listing temporarily hidden',
            'Your listing "' || coalesce(v_product.title, 'product') || '" was hidden after multiple reports. Please review and update it to comply with marketplace policies.',
            'system',
            v_product.id
          );
        end if;
      end if;
    end if;

    v_related_id := coalesce(new.product_id, new.reported_user_id, new.message_id);

    insert into public.notifications (user_id, title, content, type, related_id)
    values (
      new.reporter_id,
      'Report received',
      'We received your report and automatically flagged the content for review.',
      'system',
      v_related_id
    );
  end if;

  return new;
end;
$function$
;


