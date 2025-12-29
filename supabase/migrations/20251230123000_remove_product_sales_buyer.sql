-- Remove buyer references from product_sales now that sales are tracked without buyer attribution.
set search_path = public;

drop policy if exists "View own product sales" on public.product_sales;
drop policy if exists "View product sales as seller" on public.product_sales;
drop policy if exists "Insert product sales as seller" on public.product_sales;
drop policy if exists "Update product sales as seller" on public.product_sales;
drop policy if exists "Delete product sales as seller" on public.product_sales;

alter table public.product_sales
    drop column if exists buyer_id;

create policy "View product sales as seller"
    on public.product_sales
    for select
    using (
        exists (
            select 1
            from public.products p
            where p.id = product_sales.product_id
              and p.seller_id = auth.uid()
        )
    );

create policy "Insert product sales as seller"
    on public.product_sales
    for insert
    with check (
        exists (
            select 1
            from public.products p
            where p.id = product_sales.product_id
              and p.seller_id = auth.uid()
        )
    );

create policy "Update product sales as seller"
    on public.product_sales
    for update
    using (
        exists (
            select 1
            from public.products p
            where p.id = product_sales.product_id
              and p.seller_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.products p
            where p.id = product_sales.product_id
              and p.seller_id = auth.uid()
        )
    );

create policy "Delete product sales as seller"
    on public.product_sales
    for delete
    using (
        exists (
            select 1
            from public.products p
            where p.id = product_sales.product_id
              and p.seller_id = auth.uid()
        )
    );
