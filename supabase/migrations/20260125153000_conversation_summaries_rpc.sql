set search_path = public;

create or replace function public.list_conversation_summaries(p_user_id uuid)
returns table (
  id uuid,
  product_id uuid,
  seller_id uuid,
  buyer_id uuid,
  last_message text,
  last_message_at timestamptz,
  updated_at timestamptz,
  unread_count integer,
  product_title text,
  product_price numeric,
  product_currency varchar,
  product_image text,
  seller_full_name text,
  seller_avatar_url text,
  buyer_full_name text,
  buyer_avatar_url text
)
language sql
stable
as $$
  select
    c.id,
    c.product_id,
    c.seller_id,
    c.buyer_id,
    c.last_message,
    c.last_message_at,
    c.updated_at,
    coalesce(u.unread_count, 0) as unread_count,
    p.title as product_title,
    p.price as product_price,
    p.currency as product_currency,
    (p.images->>0) as product_image,
    s.full_name as seller_full_name,
    s.avatar_url as seller_avatar_url,
    b.full_name as buyer_full_name,
    b.avatar_url as buyer_avatar_url
  from public.conversations c
  left join public.products p on p.id = c.product_id
  left join public.public_user_profiles s on s.id = c.seller_id
  left join public.public_user_profiles b on b.id = c.buyer_id
  left join (
    select
      conversation_id,
      count(*)::int as unread_count
    from public.messages
    where receiver_id = p_user_id
      and is_read = false
    group by conversation_id
  ) u on u.conversation_id = c.id
  where c.seller_id = p_user_id
     or c.buyer_id = p_user_id
  order by c.updated_at desc nulls last;
$$;
