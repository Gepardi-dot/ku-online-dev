-- Update Sponsors category labels.
-- Data migration only.

update public.categories
set
  name = 'Sponsors & Offers',
  name_ar = 'الرعاة والعروض',
  name_ku = 'سپۆنسەر و ئۆفەر',
  description = 'Sponsorships, offers, and business partnerships.',
  icon = '/Sponsor.png.png',
  is_active = true,
  sort_order = 999
where id = '00000000-0000-0000-0000-00000000000d';
