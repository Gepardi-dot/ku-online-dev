alter table public.favorites add constraint favorites_user_product_key unique (user_id, product_id);;
