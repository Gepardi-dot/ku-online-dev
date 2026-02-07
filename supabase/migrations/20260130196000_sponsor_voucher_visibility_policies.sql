-- Allow users to read store/offer metadata for their claimed vouchers.
-- This preserves wallet usability if a store is later disabled.
set search_path = public;

-- Stores: allow select for stores tied to the viewer's voucher claims.
drop policy if exists "Users read sponsor stores for claimed vouchers" on public.sponsor_stores;
create policy "Users read sponsor stores for claimed vouchers"
  on public.sponsor_stores
  for select
  using (
    exists (
      select 1
      from public.sponsor_voucher_claims c
      where c.user_id = auth.uid()
        and c.store_id = sponsor_stores.id
    )
  );

-- Offers: allow select for offers tied to the viewer's voucher claims.
drop policy if exists "Users read sponsor offers for claimed vouchers" on public.sponsor_offers;
create policy "Users read sponsor offers for claimed vouchers"
  on public.sponsor_offers
  for select
  using (
    exists (
      select 1
      from public.sponsor_voucher_claims c
      where c.user_id = auth.uid()
        and c.offer_id = sponsor_offers.id
    )
  );

