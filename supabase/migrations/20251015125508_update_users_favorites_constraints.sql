alter table public.users
  alter column name set not null,
  alter column email set not null;

alter table public.favorites
  drop constraint if exists favorites_user_id_fkey,
  drop constraint if exists favorites_product_id_fkey;

alter table public.favorites
  add constraint favorites_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade,
  add constraint favorites_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;;
