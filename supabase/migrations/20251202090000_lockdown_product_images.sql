do $$
begin
  -- Switch to storage admin; bail quietly if role is unavailable.
  begin
    execute 'set role supabase_storage_admin';
  exception
    when insufficient_privilege then
      raise notice 'Proceeding without supabase_storage_admin; using current role.';
  end;

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

  -- Ensure the bucket row is private.
  update storage.buckets
    set public = false
    where id = 'product-images';

  begin
    execute 'reset role';
  exception
    when others then
      null;
  end;
end;
$$;
