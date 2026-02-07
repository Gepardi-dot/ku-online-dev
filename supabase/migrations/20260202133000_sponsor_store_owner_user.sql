-- Link sponsor stores to a KU BAZAR user account to enable:
-- - Store reviews (reuse existing seller reviews flow)
-- - Store product listings (seller_id = owner_user_id)

alter table public.sponsor_stores
  add column if not exists owner_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sponsor_stores_owner_user_id_fkey'
  ) then
    alter table public.sponsor_stores
      add constraint sponsor_stores_owner_user_id_fkey
      foreign key (owner_user_id) references public.users(id)
      on delete set null;
  end if;
end $$;

create index if not exists sponsor_stores_owner_user_id_idx on public.sponsor_stores(owner_user_id);

