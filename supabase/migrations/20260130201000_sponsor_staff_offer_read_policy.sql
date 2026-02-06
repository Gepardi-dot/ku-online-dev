-- Allow store staff to read active offers for their store.
-- Needed for partner redemption UI / recent redemptions display.
set search_path = public;

drop policy if exists "Sponsor staff read their store offers" on public.sponsor_offers;
create policy "Sponsor staff read their store offers"
  on public.sponsor_offers
  for select
  using (
    exists (
      select 1
      from public.sponsor_store_staff ss
      where ss.store_id = sponsor_offers.store_id
        and ss.user_id = auth.uid()
        and ss.status = 'active'
    )
  );

