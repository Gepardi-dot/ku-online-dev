-- Add optional pricing fields so we can render strikethrough pricing + % OFF math on sponsor cards.
-- These are optional for MVP; when omitted, UI falls back to discount-only labels.

alter table public.sponsor_offers
  add column if not exists original_price numeric;

alter table public.sponsor_offers
  add column if not exists deal_price numeric;

