-- Auto-expire listings 3 months after creation.
alter table if exists public.products
  add column if not exists expires_at timestamptz;

update public.products
set expires_at = coalesce(expires_at, created_at + interval '3 months')
where expires_at is null;

alter table if exists public.products
  alter column expires_at set not null;

create index if not exists products_expires_at_idx on public.products (expires_at);

create or replace function public.set_product_expires_at()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is null then
    new.expires_at := coalesce(new.created_at, now()) + interval '3 months';
  end if;
  return new;
end;
$$;

drop trigger if exists set_product_expires_at on public.products;
create trigger set_product_expires_at
before insert on public.products
for each row execute function public.set_product_expires_at();
