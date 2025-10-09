-- Run this script in the Supabase SQL editor while impersonating the storage admin role.
set role supabase_storage_admin;

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
    with check (
        bucket_id = 'product-images'
        and auth.role() = 'authenticated'
    );

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

drop policy if exists "Delete own product images" on storage.objects;
create policy "Delete own product images"
    on storage.objects
    for delete
    using (
        bucket_id = 'product-images'
        and auth.uid() = owner
    );

reset role;
