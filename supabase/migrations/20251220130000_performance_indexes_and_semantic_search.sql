set search_path = public;

-- Unread message lookups (inbox badges, mark-as-read updates).
create index if not exists idx_messages_unread_receiver
  on public.messages (receiver_id, created_at desc)
  where is_read = false;

create index if not exists idx_messages_unread_conversation_receiver
  on public.messages (conversation_id, receiver_id, created_at desc)
  where is_read = false;

-- Unread notifications filtered by UI (excluding message/favorite).
create index if not exists idx_notifications_unread_user_created
  on public.notifications (user_id, created_at desc)
  where is_read = false and type <> 'message' and type <> 'favorite';

-- Review list queries.
create index if not exists idx_reviews_seller_created_at
  on public.reviews (seller_id, created_at desc);

create index if not exists idx_reviews_product_created_at
  on public.reviews (product_id, created_at desc);

-- Moderation feed ordering.
create index if not exists idx_abuse_reports_created_at
  on public.abuse_reports (created_at desc);

-- Main marketplace browsing (active, unsold listings).
create index if not exists idx_products_active_unsold_created_at
  on public.products (created_at desc)
  where is_active = true and coalesce(is_sold, false) = false;

create index if not exists idx_products_category_active_unsold_created_at
  on public.products (category_id, created_at desc)
  where is_active = true and coalesce(is_sold, false) = false;

-- Semantic search tuned to use ivfflat (top-N by embedding, then rerank).
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
            p.images,
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
            ) as rank
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
            p.images,
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
            p.images,
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
        ) as rank
    from candidates c
    order by
        rank desc,
        c.created_at desc
    limit greatest(limit_count, 1)
    offset greatest(offset_count, 0);
end;
$$;
