alter table public.users
    add column if not exists preferred_language text default 'en',
    add column if not exists profile_visibility text default 'public',
    add column if not exists show_profile_on_marketplace boolean default true,
    add column if not exists notify_messages boolean default true,
    add column if not exists notify_offers boolean default true,
    add column if not exists notify_updates boolean default true,
    add column if not exists marketing_emails boolean default false;

alter table public.users
    add constraint users_profile_visibility_check
        check (profile_visibility in ('public', 'community', 'private'));

alter table public.users
    add constraint users_preferred_language_check
        check (preferred_language in ('en', 'ar', 'ku'));

comment on column public.users.preferred_language is 'ISO-ish language slug used for localized experiences.';
comment on column public.users.profile_visibility is 'Controls whether the seller profile is shown publicly, to the community, or kept private.';
comment on column public.users.show_profile_on_marketplace is 'Whether the seller profile is discoverable in marketplace directories.';
comment on column public.users.notify_messages is 'Send push/email notifications when a new message arrives.';
comment on column public.users.notify_offers is 'Send alerts when buyers submit offers or counter-offers.';
comment on column public.users.notify_updates is 'Send system updates about listings, orders, or disputes.';
comment on column public.users.marketing_emails is 'Opt-in flag for marketing and promotional messages.';
