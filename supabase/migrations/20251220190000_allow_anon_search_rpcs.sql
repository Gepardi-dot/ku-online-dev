-- Allow anonymous callers to use search RPCs for public listings.
grant execute on function public.search_products(
  text,
  uuid,
  numeric,
  numeric,
  text,
  integer,
  integer
) to anon;

do $$
begin
  grant execute on function public.search_products_semantic(
    text,
    vector(1536),
    uuid,
    numeric,
    numeric,
    text,
    integer,
    integer
  ) to anon;
exception
  when undefined_function then
    raise notice 'search_products_semantic not available; skipping anon grant';
end $$;
