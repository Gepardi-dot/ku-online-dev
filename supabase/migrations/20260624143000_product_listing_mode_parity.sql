set check_function_bodies = off;

alter table public.products
  add column if not exists listing_type text;

alter table public.products
  add column if not exists rental_term text;

update public.products
set listing_type = 'sale'
where listing_type is null
   or listing_type not in ('sale', 'rent');

update public.products
set rental_term = null
where listing_type = 'sale';

update public.products
set rental_term = 'monthly'
where listing_type = 'rent'
  and rental_term not in ('daily', 'monthly');

alter table public.products
  alter column listing_type set default 'sale',
  alter column listing_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'products'
      and c.conname = 'products_listing_type_valid'
  ) then
    alter table public.products
      add constraint products_listing_type_valid
      check (listing_type in ('sale', 'rent')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'products'
      and c.conname = 'products_rental_term_valid'
  ) then
    alter table public.products
      add constraint products_rental_term_valid
      check (rental_term is null or rental_term in ('daily', 'monthly')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'products'
      and c.conname = 'products_rental_term_listing_type_match'
  ) then
    alter table public.products
      add constraint products_rental_term_listing_type_match
      check (
        (listing_type = 'sale' and rental_term is null)
        or
        (listing_type = 'rent' and rental_term in ('daily', 'monthly'))
      ) not valid;
  end if;
end $$;

alter table public.products validate constraint products_listing_type_valid;
alter table public.products validate constraint products_rental_term_valid;
alter table public.products validate constraint products_rental_term_listing_type_match;

create index if not exists idx_products_category_listing_type_rental_term_created_at
  on public.products (category_id, listing_type, rental_term, created_at desc)
  where is_active = true and coalesce(is_sold, false) = false;

create or replace function public.search_products(
    search_term text,
    category uuid default null,
    min_price numeric default null,
    max_price numeric default null,
    city text default null,
    limit_count integer default 24,
    offset_count integer default 0
)
returns table (
    id uuid,
    title text,
    description text,
    price numeric,
    currency varchar,
    condition text,
    category_id uuid,
    seller_id uuid,
    location text,
    images jsonb,
    is_active boolean,
    is_sold boolean,
    is_promoted boolean,
    views integer,
    created_at timestamptz,
    updated_at timestamptz,
    rank numeric
)
language plpgsql
stable
as $$
begin
    return query
    select
        p.id,
        p.title,
        p.description,
        p.price,
        p.currency,
        p.condition,
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
$$;

revoke all on function public.search_products(text, uuid, numeric, numeric, text, integer, integer) from public;
grant execute on function public.search_products(text, uuid, numeric, numeric, text, integer, integer) to anon;
grant execute on function public.search_products(text, uuid, numeric, numeric, text, integer, integer) to authenticated;
grant execute on function public.search_products(text, uuid, numeric, numeric, text, integer, integer) to service_role;

create or replace function public.search_products(
    search_term text,
    category uuid default null,
    listing_type text default null,
    rental_term text default null,
    min_price numeric default null,
    max_price numeric default null,
    city text default null,
    limit_count integer default 24,
    offset_count integer default 0
)
returns table (
    id uuid,
    title text,
    description text,
    price numeric,
    currency varchar,
    condition text,
    listing_type text,
    rental_term text,
    category_id uuid,
    seller_id uuid,
    location text,
    images jsonb,
    is_active boolean,
    is_sold boolean,
    is_promoted boolean,
    views integer,
    created_at timestamptz,
    updated_at timestamptz,
    rank numeric
)
language plpgsql
stable
as $$
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
$$;

revoke all on function public.search_products(text, uuid, text, text, numeric, numeric, text, integer, integer) from public;
grant execute on function public.search_products(text, uuid, text, text, numeric, numeric, text, integer, integer) to anon;
grant execute on function public.search_products(text, uuid, text, text, numeric, numeric, text, integer, integer) to authenticated;
grant execute on function public.search_products(text, uuid, text, text, numeric, numeric, text, integer, integer) to service_role;

create or replace function public.search_products_semantic(
    search_term text,
    query_embedding public.vector,
    category uuid default null,
    min_price numeric default null,
    max_price numeric default null,
    city text default null,
    limit_count integer default 24,
    offset_count integer default 0
)
returns table (
    id uuid,
    title text,
    description text,
    price numeric,
    currency varchar,
    condition text,
    category_id uuid,
    seller_id uuid,
    location text,
    images jsonb,
    is_active boolean,
    is_sold boolean,
    is_promoted boolean,
    views integer,
    created_at timestamptz,
    updated_at timestamptz,
    rank numeric
)
language plpgsql
stable
as $$
declare
    v_use_fulltext boolean;
    v_candidate_limit integer;
begin
    v_use_fulltext := search_term is not null and btrim(search_term) <> '';
    v_candidate_limit := greatest(limit_count + offset_count, 1) * 10;
    v_candidate_limit := least(v_candidate_limit, 500);

    if query_embedding is null then
        return query
        select
            p.id,
            p.title,
            p.description,
            p.price,
            p.currency,
            p.condition,
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
                    when v_use_fulltext
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
                not v_use_fulltext
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
                when v_use_fulltext
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
        limit v_candidate_limit
    ),
    text_candidates as (
        select
            p.id,
            p.title,
            p.description,
            p.price,
            p.currency,
            p.condition,
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
            v_use_fulltext
            and p.is_active = true
            and coalesce(p.is_sold, false) = false
            and p.embedding is null
            and p.search_document @@ plainto_tsquery('simple', search_term)
            and (
                category is null
                or p.category_id = category
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
        limit v_candidate_limit
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
$$;

revoke all on function public.search_products_semantic(text, public.vector, uuid, numeric, numeric, text, integer, integer) from public;
grant execute on function public.search_products_semantic(text, public.vector, uuid, numeric, numeric, text, integer, integer) to anon;
grant execute on function public.search_products_semantic(text, public.vector, uuid, numeric, numeric, text, integer, integer) to authenticated;
grant execute on function public.search_products_semantic(text, public.vector, uuid, numeric, numeric, text, integer, integer) to service_role;

create or replace function public.search_products_semantic(
    search_term text,
    query_embedding public.vector,
    category uuid default null,
    listing_type text default null,
    rental_term text default null,
    min_price numeric default null,
    max_price numeric default null,
    city text default null,
    limit_count integer default 24,
    offset_count integer default 0
)
returns table (
    id uuid,
    title text,
    description text,
    price numeric,
    currency varchar,
    condition text,
    listing_type text,
    rental_term text,
    category_id uuid,
    seller_id uuid,
    location text,
    images jsonb,
    is_active boolean,
    is_sold boolean,
    is_promoted boolean,
    views integer,
    created_at timestamptz,
    updated_at timestamptz,
    rank numeric
)
language plpgsql
stable
as $$
declare
    v_use_fulltext boolean;
    v_candidate_limit integer;
begin
    v_use_fulltext := search_term is not null and btrim(search_term) <> '';
    v_candidate_limit := greatest(limit_count + offset_count, 1) * 10;
    v_candidate_limit := least(v_candidate_limit, 500);

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
                    when v_use_fulltext
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
                not v_use_fulltext
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
                when v_use_fulltext
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
        limit v_candidate_limit
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
            v_use_fulltext
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
        limit v_candidate_limit
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
$$;

revoke all on function public.search_products_semantic(text, public.vector, uuid, text, text, numeric, numeric, text, integer, integer) from public;
grant execute on function public.search_products_semantic(text, public.vector, uuid, text, text, numeric, numeric, text, integer, integer) to anon;
grant execute on function public.search_products_semantic(text, public.vector, uuid, text, text, numeric, numeric, text, integer, integer) to authenticated;
grant execute on function public.search_products_semantic(text, public.vector, uuid, text, text, numeric, numeric, text, integer, integer) to service_role;
