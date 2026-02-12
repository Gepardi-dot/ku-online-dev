do $$
begin
  -- Keep current role; avoid role-switch side effects on migration bookkeeping.
  raise notice 'Applying storage lockdown policies with current role.';

  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects table not found; skipping storage policy updates.';
  else
    begin
      -- Enforce RLS and remove any public read access.
      alter table storage.objects enable row level security;
      drop policy if exists "Public read product images" on storage.objects;

      -- Authenticated uploads only, scoped to the bucket.
      drop policy if exists "Authenticated upload product images" on storage.objects;
      create policy "Authenticated upload product images"
        on storage.objects
        for insert
        with check (
          bucket_id = 'product-images'
          and auth.role() = 'authenticated'
        );

      -- Owners can update their own objects.
      drop policy if exists "Update own product images" on storage.objects;
      create policy "Update own product images"
        on storage.objects
        for update
        using (
          bucket_id = 'product-images'
          and auth.uid() = owner
        )
        with check (
          bucket_id = 'product-images'
          and auth.uid() = owner
        );

      -- Owners can delete their own objects.
      drop policy if exists "Delete own product images" on storage.objects;
      create policy "Delete own product images"
        on storage.objects
        for delete
        using (
          bucket_id = 'product-images'
          and auth.uid() = owner
        );
    exception
      when insufficient_privilege then
        raise notice 'Insufficient privilege to update storage.objects policies; skipping policy changes.';
      when undefined_object then
        raise notice 'Storage objects policies unavailable; skipping policy changes.';
    end;
  end if;

  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets table not found; skipping bucket update.';
  else
    begin
      -- Ensure the bucket row is private.
      update storage.buckets
        set public = false
        where id = 'product-images';
    exception
      when insufficient_privilege then
        raise notice 'Insufficient privilege to update storage.buckets; skipping bucket update.';
    end;
  end if;

end;
$$;
