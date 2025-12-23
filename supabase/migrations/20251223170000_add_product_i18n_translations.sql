-- Store machine translations for product text (for cross-language search + UI localization).
alter table public.products
  add column if not exists title_translations jsonb not null default '{}'::jsonb,
  add column if not exists description_translations jsonb not null default '{}'::jsonb,
  add column if not exists i18n_source_hash text,
  add column if not exists i18n_updated_at timestamptz;

-- Mark translations stale when title/description changes.
create or replace function public.invalidate_product_i18n()
returns trigger
language plpgsql
as $$
begin
  if (new.title is distinct from old.title) or (new.description is distinct from old.description) then
    new.i18n_source_hash := null;
    new.i18n_updated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_invalidate_i18n on public.products;
create trigger products_invalidate_i18n
before update on public.products
for each row
execute function public.invalidate_product_i18n();

