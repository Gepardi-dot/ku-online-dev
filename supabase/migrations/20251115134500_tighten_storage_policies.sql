do $$
begin
  begin
    execute 'set role supabase_storage_admin';
  exception
    when insufficient_privilege then
      raise notice 'Skipping storage policies migration due to missing supabase_storage_admin privileges.';
      return;
  end;

  -- Enforce RLS and tighten access
  alter table storage.objects enable row level security;

  -- Restrict public reads to approved path only (e.g., public/*)
  drop policy if exists "Public read product images" on storage.objects;
  create policy "Public read product images"
      on storage.objects
      for select
      using (
        bucket_id = 'product-images'
        and (name like 'public/%')
      );

  -- Restrict inserts to authenticated users writing under their own folder: auth.uid()/*
  drop policy if exists "Authenticated upload product images" on storage.objects;
  create policy "Authenticated upload product images"
      on storage.objects
      for insert
      with check (
        bucket_id = 'product-images'
        and auth.role() = 'authenticated'
        and name like auth.uid()::text || '/%'
      );

  -- Restrict updates to owner, under their own folder
  drop policy if exists "Update own product images" on storage.objects;
  create policy "Update own product images"
      on storage.objects
      for update
      using (
        bucket_id = 'product-images'
        and auth.uid() = owner
        and name like auth.uid()::text || '/%'
      )
      with check (
        bucket_id = 'product-images'
        and auth.uid() = owner
        and name like auth.uid()::text || '/%'
      );

  -- Restrict deletes to owner, under their own folder
  drop policy if exists "Delete own product images" on storage.objects;
  create policy "Delete own product images"
      on storage.objects
      for delete
      using (
        bucket_id = 'product-images'
        and auth.uid() = owner
        and name like auth.uid()::text || '/%'
      );

  execute 'reset role';
end;
$$;

