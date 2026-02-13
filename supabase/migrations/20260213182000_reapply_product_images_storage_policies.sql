-- Forward-only refresh of product-images storage policies.
-- Purpose: keep historical migrations immutable and apply policy hardening here.
do $$
begin
  raise notice 'Applying product-images storage policy refresh with current role.';

  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects table not found; skipping storage policy updates.';
  else
    begin
      alter table storage.objects enable row level security;

      drop policy if exists "Public read product images" on storage.objects;
      create policy "Public read product images"
        on storage.objects
        for select
        using (bucket_id = 'product-images');

      drop policy if exists "Authenticated upload product images" on storage.objects;
      create policy "Authenticated upload product images"
        on storage.objects
        for insert
        with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

      drop policy if exists "Update own product images" on storage.objects;
      create policy "Update own product images"
        on storage.objects
        for update
        using (bucket_id = 'product-images' and auth.uid() = owner)
        with check (bucket_id = 'product-images' and auth.uid() = owner);

      drop policy if exists "Delete own product images" on storage.objects;
      create policy "Delete own product images"
        on storage.objects
        for delete
        using (bucket_id = 'product-images' and auth.uid() = owner);
    exception
      when insufficient_privilege then
        raise notice 'Insufficient privilege for storage.objects policy update; skipping.';
      when undefined_object then
        raise notice 'Storage policy objects are unavailable; skipping.';
    end;
  end if;

  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets table not found; skipping bucket visibility update.';
  else
    begin
      update storage.buckets
      set public = true
      where id = 'product-images';
    exception
      when insufficient_privilege then
        raise notice 'Insufficient privilege for storage.buckets update; skipping.';
    end;
  end if;
end;
$$;
