insert into categories (name, name_ar, name_ku, description, icon, is_active, sort_order)
values
  ('Smartphones', 'الهواتف الذكية', 'مۆبایلەکان', 'Phones and accessories', '📱', true, 1),
  ('Electronics', 'الإلكترونيات', 'ئەلیکترۆنیات', 'Computers, consoles, and more', '💻', true, 2),
  ('Home & Living', 'المنزل والمعيشة', 'ماڵ و ژیان', 'Furniture and home goods', '🏡', true, 3),
  ('Cars', 'السيارات', 'ئۆتۆمبێل', 'Vehicles and auto parts', '🚗', true, 4),
  ('Fashion', 'الموضة', 'فەشەن', 'Clothing and accessories', '👗', true, 5),
  ('Sports & Outdoors', 'الرياضة والهواء الطلق', 'وەرزش و دەرهاتوو', 'Gear for active lifestyles', '⚽', true, 6)
  on conflict (lower(name)) do nothing;;
