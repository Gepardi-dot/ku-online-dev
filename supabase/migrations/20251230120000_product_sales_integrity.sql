-- Harden product_sales integrity and cleanup when listings are marked available.
set search_path = public;

create or replace function public.cleanup_product_sales_on_unsold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.is_sold is true and new.is_sold is false then
        delete from public.product_sales where product_id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists product_sales_cleanup_on_unsold on public.products;
create trigger product_sales_cleanup_on_unsold
    after update of is_sold
    on public.products
    for each row execute function public.cleanup_product_sales_on_unsold();

create or replace function public.ensure_product_sales_on_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_sold is true and old.is_sold is false then
        insert into public.product_sales (product_id, sold_at)
        values (new.id, timezone('utc', now()))
        on conflict (product_id) do update
          set sold_at = excluded.sold_at;
    end if;
    return new;
end;
$$;

drop trigger if exists product_sales_ensure_on_sold on public.products;
create trigger product_sales_ensure_on_sold
    after update of is_sold
    on public.products
    for each row execute function public.ensure_product_sales_on_sold();
