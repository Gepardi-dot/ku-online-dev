set search_path = public;

create table if not exists public.review_helpful (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint review_helpful_pk primary key (review_id, user_id)
);

alter table public.review_helpful enable row level security;

drop policy if exists "Read review helpful" on public.review_helpful;
create policy "Read review helpful"
  on public.review_helpful for select using (true);

drop policy if exists "Vote helpful" on public.review_helpful;
create policy "Vote helpful"
  on public.review_helpful for insert with check (auth.uid() = user_id);

drop policy if exists "Unvote helpful" on public.review_helpful;
create policy "Unvote helpful"
  on public.review_helpful for delete using (auth.uid() = user_id);

create index if not exists idx_review_helpful_review on public.review_helpful(review_id);
create index if not exists idx_review_helpful_user on public.review_helpful(user_id);

