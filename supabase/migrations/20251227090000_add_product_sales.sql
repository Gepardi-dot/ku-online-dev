-- Add minimal product_sales tracking for sold listings.
set search_path = public;

create table if not exists public.product_sales (
    product_id uuid primary key references public.products(id) on delete cascade,
    buyer_id uuid references public.users(id) on delete set null,
    sold_at timestamptz not null default timezone('utc', now())
);

alter table public.product_sales enable row level security;

drop policy if exists "View own product sales" on public.product_sales;
create policy "View own product sales"
    on public.product_sales
    for select
    using (
        auth.uid() = buyer_id
        or exists (
            select 1
            from public.products p
            where p.id = product_sales.product_id
              and p.seller_id = auth.uid()
        )
    );

drop policy if exists "Insert product sales as seller" on public.product_sales;
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

drop policy if exists "Update product sales as seller" on public.product_sales;
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
