-- Enable pgvector extension for semantic similarity.
create extension if not exists vector;

-- Add embedding column for semantic product vectors.
alter table public.products
  add column if not exists embedding vector(1536);

-- Create ANN index for fast cosine similarity lookups.
create index if not exists products_embedding_idx
  on public.products
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Smart recommendation RPC that blends embedding similarity with business rules.
create or replace function public.recommend_products(
  target_product uuid,
  limit_count integer default 6
)
returns table (
  id uuid,
  title text,
  description text,
  price numeric,
  currency varchar,
  condition text,
  color_token text,
  category_id uuid,
  seller_id uuid,
  location text,
  images text[],
  is_active boolean,
  is_sold boolean,
  is_promoted boolean,
  views integer,
  created_at timestamptz,
  updated_at timestamptz,
  embedding vector(1536),
  similarity double precision
)
language plpgsql
as $$
declare
  target_record record;
  lower_price numeric;
  upper_price numeric;
  normalized_location text;
begin
  select
    category_id,
    price,
    location,
    embedding
  into target_record
  from public.products
  where id = target_product
    and coalesce(is_active, true)
    and coalesce(is_sold, false) = false
  limit 1;

  if not found then
    return;
  end if;

  lower_price := case when target_record.price is null then null else target_record.price * 0.7 end;
  upper_price := case when target_record.price is null then null else target_record.price * 1.3 end;
  normalized_location := case
    when target_record.location is null then null
    else btrim(target_record.location)
  end;

  return query
  select
    p.id,
    p.title,
    p.description,
    p.price,
    p.currency,
    p.condition,
    p.color_token,
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
    p.embedding,
    case
      when target_record.embedding is not null and p.embedding is not null
        then 1 - (target_record.embedding <-> p.embedding)
      else null
    end as similarity
  from public.products p
  where
    p.id <> target_product
    and coalesce(p.is_active, true)
    and coalesce(p.is_sold, false) = false
    and (
      target_record.category_id is null
      or p.category_id = target_record.category_id
    )
    and (
      lower_price is null
      or (p.price between lower_price and upper_price)
    )
    and (
      normalized_location is null
      or (p.location ilike normalized_location || '%')
    )
  order by
    case
      when target_record.embedding is not null and p.embedding is not null
        then target_record.embedding <-> p.embedding
      else null
    end asc nulls last,
    p.views desc,
    p.created_at desc
  limit greatest(limit_count, 1);
end;
$$;

grant execute on function public.recommend_products(uuid, integer) to authenticated;
