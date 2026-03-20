set check_function_bodies = off;

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
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  v_role := coalesce(auth.jwt() ->> 'role', '');

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
  where p.id = p_product_id;

  if v_row is null then
    return null;
  end if;

  if v_seller_id is distinct from v_uid and v_role not in ('admin', 'moderator') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return v_row;
end;
$function$
;

revoke execute on function public.get_algolia_product_row_secure(uuid) from anon;
revoke all on function public.get_algolia_product_row_secure(uuid) from public;
grant execute on function public.get_algolia_product_row_secure(uuid) to authenticated;
grant execute on function public.get_algolia_product_row_secure(uuid) to service_role;

