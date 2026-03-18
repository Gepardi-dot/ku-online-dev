drop function if exists "public"."search_products"(search_term text, category uuid, min_price numeric, max_price numeric, city text, limit_count integer, offset_count integer);

drop function if exists "public"."search_products_semantic"(search_term text, query_embedding public.vector, category uuid, min_price numeric, max_price numeric, city text, limit_count integer, offset_count integer);

alter table "public"."products" add column "listing_type" text not null default 'sale'::text;

alter table "public"."products" add column "rental_term" text;

CREATE INDEX idx_products_category_listing_type_rental_term_created_at ON public.products USING btree (category_id, listing_type, rental_term, created_at DESC) WHERE ((is_active = true) AND (COALESCE(is_sold, false) = false));

alter table "public"."products" add constraint "products_listing_type_valid" CHECK ((listing_type = ANY (ARRAY['sale'::text, 'rent'::text]))) not valid;

alter table "public"."products" validate constraint "products_listing_type_valid";

alter table "public"."products" add constraint "products_rental_term_listing_type_match" CHECK ((((listing_type = 'sale'::text) AND (rental_term IS NULL)) OR ((listing_type = 'rent'::text) AND (rental_term = ANY (ARRAY['daily'::text, 'monthly'::text]))))) not valid;

alter table "public"."products" validate constraint "products_rental_term_listing_type_match";

alter table "public"."products" add constraint "products_rental_term_valid" CHECK (((rental_term IS NULL) OR (rental_term = ANY (ARRAY['daily'::text, 'monthly'::text])))) not valid;

alter table "public"."products" validate constraint "products_rental_term_valid";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.search_products(search_term text, category uuid DEFAULT NULL::uuid, listing_type text DEFAULT NULL::text, rental_term text DEFAULT NULL::text, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric, city text DEFAULT NULL::text, limit_count integer DEFAULT 24, offset_count integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, description text, price numeric, currency character varying, condition text, listing_type text, rental_term text, category_id uuid, seller_id uuid, location text, images jsonb, is_active boolean, is_sold boolean, is_promoted boolean, views integer, created_at timestamp with time zone, updated_at timestamp with time zone, rank numeric)
 LANGUAGE plpgsql
AS $function$
begin
    return query
    select
        p.id,
        p.title,
        p.description,
        p.price,
        p.currency,
        p.condition,
        p.listing_type,
        p.rental_term,
        p.category_id,
        p.seller_id,
        p.location,
        to_jsonb(p.images) as images,
        p.is_active,
        p.is_sold,
        p.is_promoted,
        p.views,
        p.created_at,
        p.updated_at,
        coalesce(
            case
                when search_term is null or btrim(search_term) = ''
                    then 0
                else ts_rank(p.search_document, plainto_tsquery('simple', search_term))
            end,
            0
        )::numeric as rank
    from public.products p
    where
        p.is_active = true
        and coalesce(p.is_sold, false) = false
        and (
            search_term is null
            or btrim(search_term) = ''
            or p.search_document @@ plainto_tsquery('simple', search_term)
        )
        and (
            category is null
            or p.category_id = category
        )
        and (
            listing_type is null
            or p.listing_type = listing_type
        )
        and (
            rental_term is null
            or p.rental_term = rental_term
        )
        and (
            min_price is null
            or p.price >= min_price
        )
        and (
            max_price is null
            or p.price <= max_price
        )
        and (
            city is null
            or btrim(city) = ''
            or p.location ilike city || '%'
        )
    order by
        case
            when search_term is null or btrim(search_term) = ''
                then null
            else coalesce(ts_rank(p.search_document, plainto_tsquery('simple', search_term)), 0)
        end desc,
        p.created_at desc
    limit greatest(limit_count, 1)
    offset greatest(offset_count, 0);
end;
$function$
;

grant execute on function public.search_products(
  text,
  uuid,
  text,
  text,
  numeric,
  numeric,
  text,
  integer,
  integer
) to authenticated;

grant execute on function public.search_products(
  text,
  uuid,
  text,
  text,
  numeric,
  numeric,
  text,
  integer,
  integer
) to anon;

CREATE OR REPLACE FUNCTION public.search_products_semantic(search_term text, query_embedding public.vector, category uuid DEFAULT NULL::uuid, listing_type text DEFAULT NULL::text, rental_term text DEFAULT NULL::text, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric, city text DEFAULT NULL::text, limit_count integer DEFAULT 24, offset_count integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, description text, price numeric, currency character varying, condition text, listing_type text, rental_term text, category_id uuid, seller_id uuid, location text, images jsonb, is_active boolean, is_sold boolean, is_promoted boolean, views integer, created_at timestamp with time zone, updated_at timestamp with time zone, rank numeric)
 LANGUAGE plpgsql
AS $function$
declare
    use_fulltext boolean;
    candidate_limit integer;
begin
    use_fulltext := search_term is not null and btrim(search_term) <> '';
    candidate_limit := greatest(limit_count + offset_count, 1) * 10;
    candidate_limit := least(candidate_limit, 500);

    if query_embedding is null then
        return query
        select
            p.id,
            p.title,
            p.description,
            p.price,
            p.currency,
            p.condition,
            p.listing_type,
            p.rental_term,
            p.category_id,
            p.seller_id,
            p.location,
            to_jsonb(p.images) as images,
            p.is_active,
            p.is_sold,
            p.is_promoted,
            p.views,
            p.created_at,
            p.updated_at,
            coalesce(
                case
                    when use_fulltext
                        then ts_rank(p.search_document, plainto_tsquery('simple', search_term))
                    else 0
                end,
                0
            )::numeric as rank
        from public.products p
        where
            p.is_active = true
            and coalesce(p.is_sold, false) = false
            and (
                category is null
                or p.category_id = category
            )
            and (
                listing_type is null
                or p.listing_type = listing_type
            )
            and (
                rental_term is null
                or p.rental_term = rental_term
            )
            and (
                min_price is null
                or p.price >= min_price
            )
            and (
                max_price is null
                or p.price <= max_price
            )
            and (
                city is null
                or btrim(city) = ''
                or p.location ilike city || '%'
            )
            and (
                not use_fulltext
                or p.search_document @@ plainto_tsquery('simple', search_term)
            )
        order by
            rank desc,
            p.created_at desc
        limit greatest(limit_count, 1)
        offset greatest(offset_count, 0);
        return;
    end if;

    return query
    with embedding_candidates as (
        select
            p.id,
            p.title,
            p.description,
            p.price,
            p.currency,
            p.condition,
            p.listing_type,
            p.rental_term,
            p.category_id,
            p.seller_id,
            p.location,
            to_jsonb(p.images) as images,
            p.is_active,
            p.is_sold,
            p.is_promoted,
            p.views,
            p.created_at,
            p.updated_at,
            (p.embedding <-> query_embedding) as distance,
            case
                when use_fulltext
                    then ts_rank(p.search_document, plainto_tsquery('simple', search_term))
                else 0
            end as text_rank
        from public.products p
        where
            p.is_active = true
            and coalesce(p.is_sold, false) = false
            and p.embedding is not null
            and (
                category is null
                or p.category_id = category
            )
            and (
                listing_type is null
                or p.listing_type = listing_type
            )
            and (
                rental_term is null
                or p.rental_term = rental_term
            )
            and (
                min_price is null
                or p.price >= min_price
            )
            and (
                max_price is null
                or p.price <= max_price
            )
            and (
                city is null
                or btrim(city) = ''
                or p.location ilike city || '%'
            )
        order by p.embedding <-> query_embedding
        limit candidate_limit
    ),
    text_candidates as (
        select
            p.id,
            p.title,
            p.description,
            p.price,
            p.currency,
            p.condition,
            p.listing_type,
            p.rental_term,
            p.category_id,
            p.seller_id,
            p.location,
            to_jsonb(p.images) as images,
            p.is_active,
            p.is_sold,
            p.is_promoted,
            p.views,
            p.created_at,
            p.updated_at,
            null::double precision as distance,
            ts_rank(p.search_document, plainto_tsquery('simple', search_term)) as text_rank
        from public.products p
        where
            use_fulltext
            and p.is_active = true
            and coalesce(p.is_sold, false) = false
            and p.embedding is null
            and p.search_document @@ plainto_tsquery('simple', search_term)
            and (
                category is null
                or p.category_id = category
            )
            and (
                listing_type is null
                or p.listing_type = listing_type
            )
            and (
                rental_term is null
                or p.rental_term = rental_term
            )
            and (
                min_price is null
                or p.price >= min_price
            )
            and (
                max_price is null
                or p.price <= max_price
            )
            and (
                city is null
                or btrim(city) = ''
                or p.location ilike city || '%'
            )
        order by text_rank desc
        limit candidate_limit
    ),
    candidates as (
        select * from embedding_candidates
        union all
        select * from text_candidates
    )
    select
        c.id,
        c.title,
        c.description,
        c.price,
        c.currency,
        c.condition,
        c.listing_type,
        c.rental_term,
        c.category_id,
        c.seller_id,
        c.location,
        c.images,
        c.is_active,
        c.is_sold,
        c.is_promoted,
        c.views,
        c.created_at,
        c.updated_at,
        (
            coalesce(
                case
                    when c.distance is not null
                        then 1 - c.distance
                    else 0
                end,
                0
            ) * 0.7
            +
            coalesce(c.text_rank, 0) * 0.3
        )::numeric as rank
    from candidates c
    order by
        rank desc,
        c.created_at desc
    limit greatest(limit_count, 1)
    offset greatest(offset_count, 0);
end;
$function$
;

grant execute on function public.search_products_semantic(
  text,
  public.vector,
  uuid,
  text,
  text,
  numeric,
  numeric,
  text,
  integer,
  integer
) to authenticated;

grant execute on function public.search_products_semantic(
  text,
  public.vector,
  uuid,
  text,
  text,
  numeric,
  numeric,
  text,
  integer,
  integer
) to anon;

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
      'listing_type', p.listing_type,
      'rental_term', p.rental_term,
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
