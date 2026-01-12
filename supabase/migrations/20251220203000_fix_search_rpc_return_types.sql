-- Align search RPC return types with underlying columns (avoid mismatched result types).
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

grant execute on function public.search_products(
    text,
    uuid,
    numeric,
    numeric,
    text,
    integer,
    integer
) to authenticated;

grant execute on function public.search_products(
    text,
    uuid,
    numeric,
    numeric,
    text,
    integer,
    integer
) to anon;

create or replace function public.search_products_semantic(
    search_term text,
    query_embedding vector(1536),
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
as $$
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

grant execute on function public.search_products_semantic(
    text,
    vector(1536),
    uuid,
    numeric,
    numeric,
    text,
    integer,
    integer
) to authenticated;

grant execute on function public.search_products_semantic(
    text,
    vector(1536),
    uuid,
    numeric,
    numeric,
    text,
    integer,
    integer
) to anon;
