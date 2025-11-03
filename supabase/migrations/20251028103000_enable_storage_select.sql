drop policy if exists "Public read for product images"
on storage.objects;

create policy "Public read for product images"
on storage.objects
for select
to authenticated, anon
using (bucket_id = 'product-images');
