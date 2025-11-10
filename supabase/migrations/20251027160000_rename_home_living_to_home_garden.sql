-- Rename existing 'Home & Living' to 'Home & Garden' or deactivate the duplicate if it exists
do $$
begin
  if exists (select 1 from public.categories where lower(name) = 'home & garden') then
    -- A 'Home & Garden' row already exists; deactivate the older 'Home & Living' to avoid duplicates
    update public.categories set is_active = false where lower(name) = 'home & living';
  else
    -- No duplicate; just rename in place
    update public.categories set name = 'Home & Garden' where lower(name) = 'home & living';
  end if;
end $$;

