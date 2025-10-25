alter table users
    add column if not exists full_name text,
    add column if not exists avatar_url text,
    add column if not exists phone text,
    add column if not exists location text,
    add column if not exists bio text,
    add column if not exists rating numeric,
    add column if not exists total_ratings integer,
    add column if not exists response_rate text,
    add column if not exists is_verified boolean default false,
    add column if not exists profile_completed boolean default false,
    add column if not exists updated_at timestamptz default now();

create index if not exists users_email_idx on users (lower(email));;
