set search_path = public;

alter table public.products
  add column if not exists sponsor_store_id uuid references public.sponsor_stores(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_sponsor_store_id_fkey'
  ) then
    alter table public.products
      add constraint products_sponsor_store_id_fkey
      foreign key (sponsor_store_id)
      references public.sponsor_stores(id)
      on delete set null;
  end if;
end $$;

create index if not exists products_sponsor_store_id_idx
  on public.products (sponsor_store_id);

create index if not exists products_sponsor_store_id_created_at_idx
  on public.products (sponsor_store_id, created_at desc);

drop policy if exists "Insert products as seller" on public.products;
create policy "Insert products as seller"
  on public.products
  for insert
  with check (
    (
      sponsor_store_id is null
      and auth.uid() = seller_id
    )
    or (
      sponsor_store_id is not null
      and exists (
        select 1
        from public.sponsor_stores s
        where s.id = products.sponsor_store_id
          and s.owner_user_id = products.seller_id
      )
      and (
        auth.uid() = seller_id
        or (auth.jwt() ->> 'role') in ('admin', 'moderator')
        or exists (
          select 1
          from public.sponsor_store_staff ss
          where ss.store_id = products.sponsor_store_id
            and ss.user_id = auth.uid()
            and ss.status = 'active'
            and ss.role = 'manager'
        )
      )
    )
  );

drop policy if exists "Update own products" on public.products;
create policy "Update own products"
  on public.products
  for update
  using (auth.uid() = seller_id)
  with check (
    auth.uid() = seller_id
    and (
      sponsor_store_id is null
      or exists (
        select 1
        from public.sponsor_stores s
        where s.id = products.sponsor_store_id
          and s.owner_user_id = products.seller_id
      )
    )
  );

drop policy if exists "Staff manage sponsor store products" on public.products;
create policy "Staff manage sponsor store products"
  on public.products
  for update
  using (
    (auth.jwt() ->> 'role') in ('admin', 'moderator')
    or (
      products.sponsor_store_id is not null
      and exists (
        select 1
        from public.sponsor_store_staff ss
        where ss.store_id = products.sponsor_store_id
          and ss.user_id = auth.uid()
          and ss.status = 'active'
          and ss.role = 'manager'
      )
    )
  )
  with check (
    (
      sponsor_store_id is null
      and (
        auth.uid() = seller_id
        or (auth.jwt() ->> 'role') in ('admin', 'moderator')
      )
    )
    or (
      sponsor_store_id is not null
      and exists (
        select 1
        from public.sponsor_stores s
        where s.id = products.sponsor_store_id
          and s.owner_user_id = products.seller_id
      )
      and (
        auth.uid() = seller_id
        or (auth.jwt() ->> 'role') in ('admin', 'moderator')
        or exists (
          select 1
          from public.sponsor_store_staff ss
          where ss.store_id = products.sponsor_store_id
            and ss.user_id = auth.uid()
            and ss.status = 'active'
            and ss.role = 'manager'
        )
      )
    )
  );

drop policy if exists "Staff delete sponsor store products" on public.products;
create policy "Staff delete sponsor store products"
  on public.products
  for delete
  using (
    (auth.jwt() ->> 'role') in ('admin', 'moderator')
    or (
      products.sponsor_store_id is not null
      and exists (
        select 1
        from public.sponsor_store_staff ss
        where ss.store_id = products.sponsor_store_id
          and ss.user_id = auth.uid()
          and ss.status = 'active'
          and ss.role = 'manager'
      )
    )
  );

