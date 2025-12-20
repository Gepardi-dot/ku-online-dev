set search_path = public;

-- Prevent self-conversations.
alter table public.conversations
  drop constraint if exists conversations_seller_buyer_diff,
  add constraint conversations_seller_buyer_diff check (seller_id <> buyer_id);

-- Ensure conversation seller matches product seller when a product is attached.
create or replace function public.validate_conversation_product_seller()
returns trigger
language plpgsql
as $$
begin
  if new.product_id is null then
    return new;
  end if;

  if new.seller_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Seller is required for product conversations',
      detail = 'ku_conversation_missing_seller';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = new.product_id
      and p.seller_id = new.seller_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Conversation seller does not match product seller',
      detail = 'ku_conversation_seller_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_conversations_validate_product_seller on public.conversations;
create trigger trg_conversations_validate_product_seller
  before insert or update of product_id, seller_id on public.conversations
  for each row
  execute procedure public.validate_conversation_product_seller();

-- Ensure messages are between conversation participants and reference the same product.
create or replace function public.validate_message_participants()
returns trigger
language plpgsql
as $$
declare
  convo record;
begin
  select id, seller_id, buyer_id, product_id
  into convo
  from public.conversations
  where id = new.conversation_id;

  if convo.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Conversation not found for message',
      detail = 'ku_message_conversation_missing';
  end if;

  if new.sender_id is null or new.receiver_id is null then
    if tg_op = 'INSERT' then
      raise exception using
        errcode = 'P0001',
        message = 'Sender and receiver are required',
        detail = 'ku_message_missing_participant';
    end if;

    -- Allow nulls on updates (for example, when users are deleted and FKs set null).
    return new;
  end if;

  if not (
    (new.sender_id = convo.seller_id and new.receiver_id = convo.buyer_id)
    or
    (new.sender_id = convo.buyer_id and new.receiver_id = convo.seller_id)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Message participants must match the conversation',
      detail = 'ku_message_participant_mismatch';
  end if;

  if new.product_id is not null and convo.product_id is distinct from new.product_id then
    raise exception using
      errcode = 'P0001',
      message = 'Message product does not match conversation',
      detail = 'ku_message_product_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_validate_participants on public.messages;
create trigger trg_messages_validate_participants
  before insert or update of conversation_id, sender_id, receiver_id, product_id on public.messages
  for each row
  execute procedure public.validate_message_participants();
