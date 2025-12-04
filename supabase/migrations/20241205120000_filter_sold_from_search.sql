-- Ensure search_products omits sold listings
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
        p.images,
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
        ) as rank
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
