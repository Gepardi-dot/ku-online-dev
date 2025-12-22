-- Align product-images bucket to be public-readable while keeping writes restricted.
do $$
begin
  begin
    execute 'set role supabase_storage_admin';
  exception
    when insufficient_privilege then
      raise notice 'Proceeding without supabase_storage_admin; using current role.';
  end;

  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects table not found; skipping storage policy updates.';
  else
    begin
      alter table storage.objects enable row level security;
    exception
      when insufficient_privilege then
        raise notice 'Insufficient privilege to alter storage.objects; skipping RLS enable.';
    end;

    begin
      drop policy if exists "Public read product images" on storage.objects;
      create policy "Public read product images"
        on storage.objects
        for select
        using (bucket_id = 'product-images');

      -- Keep write/delete scoped to owners (policies may already exist from previous migrations).
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
        raise notice 'Insufficient privilege to update storage policies; skipping policy changes.';
      when undefined_object then
        raise notice 'Storage policies unavailable; skipping policy changes.';
    end;
  end if;

  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets table not found; skipping bucket update.';
  else
    begin
      update storage.buckets
        set public = true
        where id = 'product-images';
    exception
      when insufficient_privilege then
        raise notice 'Insufficient privilege to update storage.buckets; skipping bucket update.';
    end;
  end if;

  begin
    execute 'reset role';
  exception
    when others then
      null;
  end;
end;
$$;
