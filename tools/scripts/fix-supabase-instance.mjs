#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const envFile = path.resolve('.env.local');

if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=\s*(.*)$/);
    if (!match) continue;
    let [, key, value] = match;
    if (value?.startsWith('"') && value?.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(dbUrl.replace(/"/g, ''), { prepare: false });

async function applySql(label, statement) {
  process.stdout.write(`\n-- ${label}\n`);
  try {
    const result = await sql.unsafe(statement);
    console.log('OK');
    return result;
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  await applySql('Allow users.name to be nullable', `
    alter table public.users
      alter column name drop not null;
  `);

  await applySql('Update auth/user sync trigger with safe name fallback', `
    create or replace function public.handle_auth_user_change()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
        full_name text;
        preferred text;
        avatar text;
        safe_name text;
        avatar_changed boolean := true;
    begin
        full_name := coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            new.raw_user_meta_data->>'fullName'
        );
        preferred := coalesce(
            new.raw_user_meta_data->>'preferred_username',
            new.raw_user_meta_data->>'user_name',
            new.raw_user_meta_data->>'username'
        );
        avatar := nullif(new.raw_user_meta_data->>'avatar_url', '');

        safe_name := coalesce(
            nullif(full_name, ''),
            nullif(preferred, ''),
            nullif(new.email, ''),
            split_part(new.email, '@', 1),
            'Customer'
        );

        if tg_op = 'UPDATE' then
            avatar_changed := coalesce(new.raw_user_meta_data->>'avatar_url', '') is distinct from coalesce(old.raw_user_meta_data->>'avatar_url', '');
        end if;

        insert into public.users (
            id,
            email,
            full_name,
            avatar_url,
            name,
            created_at,
            updated_at
        )
        values (
            new.id,
            new.email,
            nullif(full_name, ''),
            avatar,
            safe_name,
            timezone('utc', now()),
            timezone('utc', now())
        )
        on conflict (id) do update
        set email = excluded.email,
            full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
            avatar_url = case
                when avatar_changed then excluded.avatar_url
                else public.users.avatar_url
            end,
            name = coalesce(
                nullif(excluded.name, ''),
                public.users.name,
                split_part(excluded.email, '@', 1),
                'Customer'
            ),
            updated_at = timezone('utc', now());

        return new;
    end;
    $$;
  `);

  await applySql('Ensure product-images bucket is public', `
    update storage.buckets
      set public = true
    where id = 'product-images';
  `);

  await applySql('Reset storage policies for product-images', `
    drop policy if exists "Public read product images" on storage.objects;
    drop policy if exists "Authenticated upload product images" on storage.objects;
    drop policy if exists "Update own product images" on storage.objects;
    drop policy if exists "Delete own product images" on storage.objects;
    drop policy if exists "Users can upload to own folder" on storage.objects;
    drop policy if exists "Users manage own objects" on storage.objects;
    drop policy if exists "Users delete own objects" on storage.objects;

    create policy "Public read product images"
      on storage.objects
      for select
      using (
        bucket_id = 'product-images'
      );

    create policy "Authenticated upload product images"
      on storage.objects
      for insert
      with check (
        bucket_id = 'product-images'
        and auth.role() = 'authenticated'
      );

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

    create policy "Delete own product images"
      on storage.objects
      for delete
      using (
        bucket_id = 'product-images'
        and auth.uid() = owner
      );
  `);

  // Canonical marketplace categories used across the app.
  const desiredCategories = [
    { name: 'Smartphones and iPads', icon: '📱', sort: 1 },
    { name: 'Fashion', icon: '👗', sort: 2 },
    { name: 'Electronics', icon: '💻', sort: 3 },
    { name: 'Sports', icon: '🏀', sort: 4 },
    { name: 'Home Appliance', icon: '🏠', sort: 5 },
    { name: 'Kids & Toys', icon: '🧸', sort: 6 },
    { name: 'Furniture', icon: '🛋️', sort: 7 },
    { name: 'Services', icon: '🧰', sort: 8 },
    { name: 'Cars', icon: '🚗', sort: 9 },
    { name: 'Property', icon: '🏡', sort: 10 },
    { name: 'Free', icon: '🎁', sort: 11 },
    { name: 'Others', icon: '📦', sort: 12 },
  ];

  for (const entry of desiredCategories) {
    await applySql(`Upsert category ${entry.name}`, `
      insert into public.categories as c (name, icon, sort_order, is_active)
      values ('${entry.name}', '${entry.icon}', ${entry.sort}, true)
      on conflict (lower(name)) do update
        set icon = excluded.icon,
            sort_order = excluded.sort_order,
            is_active = true;
    `);
  }

  await applySql('Disable legacy categories not in curated set', `
    update public.categories
      set is_active = false
    where lower(name) not in (${desiredCategories.map((c) => `'${c.name.toLowerCase()}'`).join(', ')});
  `);

  const columnState = await sql`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'name';
  `;
  console.log('\nusers.name nullable ->', columnState[0]?.is_nullable);

  await sql.end();
}

main().catch(async (error) => {
  console.error('Failed to fix Supabase configuration:', error);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
