-- Allow admin/moderator roles (from JWT claim auth.jwt()->>'role') to read moderation-sensitive tables.
do $$
begin
  -- Helper predicate for admin/moderator roles
  -- (no need to materialize; inline in each policy)

  -- abuse_reports
  drop policy if exists "Admin read abuse reports" on public.abuse_reports;
  create policy "Admin read abuse reports"
    on public.abuse_reports
    for select
    using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

  -- blocked_users
  drop policy if exists "Admin read blocked users" on public.blocked_users;
  create policy "Admin read blocked users"
    on public.blocked_users
    for select
    using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

  -- messages
  drop policy if exists "Admin read messages" on public.messages;
  create policy "Admin read messages"
    on public.messages
    for select
    using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

  -- conversations
  drop policy if exists "Admin read conversations" on public.conversations;
  create policy "Admin read conversations"
    on public.conversations
    for select
    using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));

  -- products (read all, including inactive)
  drop policy if exists "Admin read products" on public.products;
  create policy "Admin read products"
    on public.products
    for select
    using ((auth.jwt() ->> 'role') in ('admin', 'moderator'));
end;
$$;
