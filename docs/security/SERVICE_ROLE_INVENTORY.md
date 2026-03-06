# Service-Role Inventory (Phase 4)

Last updated: `2026-02-23`
Scope: `src/app/api/**/route.ts` files that instantiate a Supabase service-role/admin client.

## Classification Rules
- `Required now`: route performs privileged cross-user/system actions that cannot be done safely with current RLS/policies.
- `Replaceable later`: route likely can move to scoped client + RLS or constrained RPC with targeted schema/policy work.

## Required Now
- `src/app/api/account/delete/route.ts`
  Reason: account lifecycle cleanup across auth + related rows requires elevated privileges.
- `src/app/api/auth/send-sms/route.ts`
  Reason: writes to SMS audit/log tables and hook workflows that are system-owned.
- `src/app/api/vonage/webhook/route.ts`
  Reason: external provider webhook ingestion and system-side writes.
- `src/app/api/uploads/route.ts`
  Reason: storage administration (upload/delete variants) across protected object paths.
- `src/app/api/uploads/sign/route.ts`
  Reason: signed upload token issuance is a privileged storage operation.
- `src/app/api/products/[id]/route.ts`
  Reason: moderator hard-delete path includes storage cleanup and cross-user product removal.
- `src/app/api/products/[id]/sold/route.ts`
  Reason: cross-user notifications and product-sales state changes.
- `src/app/api/products/translate/route.ts`
  Reason: server-side translation persistence and downstream sync.
- `src/app/api/admin/users/verify/route.ts`
  Reason: moderator verification updates other users.
- `src/app/api/abuse/report/manage/route.ts`
  Reason: moderator abuse adjudication and product reactivation actions.
- `src/app/api/admin/moderate/route.ts`
  Reason: privileged admin moderation operations.
- `src/app/api/admin/announcements/route.ts`
  Reason: admin announcement writes and system revalidation behavior.
- `src/app/api/admin/app-contacts/route.ts`
  Reason: privileged app-contact configuration updates.
- `src/app/api/admin/app-settings/sponsor-live-stats/route.ts`
  Reason: admin-level app setting writes.
- `src/app/api/admin/sponsors/stores/route.ts`
  Reason: admin sponsor-store lifecycle management.
- `src/app/api/admin/sponsors/stores/[storeId]/status/route.ts`
  Reason: admin status transitions across sponsor entities.
- `src/app/api/internal/pwa/rollout-status/route.ts`
  Reason: internal SLO/dispatch telemetry access and system visibility controls.
- `src/app/api/internal/health/route.ts`
  Reason: privileged deep diagnostics (service-role DB/storage checks) are intentionally internal and token-protected.
- `src/app/api/sponsors/services/route.ts`
  Reason: sponsor staff/admin offer management uses cross-user store relations.
- `src/app/api/sponsors/services/[offerId]/route.ts`
  Reason: sponsor staff/admin offer mutation path.
- `src/app/api/sponsors/store/route.ts`
  Reason: sponsor store management flow currently depends on elevated joins/updates.

## Replaceable Later (Planned Refactor Candidates)
- None currently tracked.

## Hardening Applied In Slice C - Part 2
- Added origin allow-list checks and rate limits to:
  - `src/app/api/admin/users/verify/route.ts`
  - `src/app/api/abuse/report/manage/route.ts`
  - `src/app/api/uploads/sign/route.ts`
  - `src/app/api/products/[id]/route.ts`

## Hardening Applied In Slice C - Part 3
- Added origin allow-list checks and rate limits to:
  - `src/app/api/messages/conversations/route.ts`
  - `src/app/api/messages/conversations/[id]/route.ts`
  - `src/app/api/messages/conversations/[id]/messages/route.ts`
  - `src/app/api/messages/conversations/[id]/read/route.ts`
  - `src/app/api/messages/[id]/route.ts`

## Hardening Applied In Slice C - Part 4
- Added per-user rate limiting to:
  - `src/app/api/sponsors/stats/click/route.ts`

## Hardening Applied In Slice C - Part 5
- Added per-user rate limiting to:
  - `src/app/api/search/click/route.ts`
- Added first concrete service-role reduction spec:
  - `docs/security/SERVICE_ROLE_REDUCTION_PLAN.md`

## Hardening Applied In Slice C - Part 6
- Added origin allow-list checks, per-IP throttling, and privileged-call throttling to:
  - `src/app/api/admin/moderate/route.ts`

## Hardening Applied In Slice C - Part 7
- Added parity hardening (origin allow-list parity, per-IP + token throttling, stricter payload date checks) to:
  - `src/app/api/admin/announcements/route.ts`

## Hardening Applied In Slice C - Part 8
- Added parity hardening (origin allow-list + secret-principal throttle on top of IP throttling) to:
  - `src/app/api/internal/pwa/rollout-status/route.ts`

## Hardening Applied In Slice C - Part 9
- Added parity hardening (origin allow-list, IP + principal throttling, production secret guard, stricter phone normalization) to:
  - `src/app/api/auth/send-sms/route.ts`

## Hardening Applied In Slice C - Part 10
- Added parity hardening (origin allow-list, IP + principal throttling, payload guards, and signature-validation improvement) to:
  - `src/app/api/vonage/webhook/route.ts`

## Hardening Applied In Slice C - Part 11
- Added parity hardening (origin parity + per-user delete throttle on top of IP throttling) to:
  - `src/app/api/account/delete/route.ts`

## Hardening Applied In Slice C - Part 12
- Added parity hardening (origin allow-list + IP/user throttling parity) to:
  - `src/app/api/admin/users/verify/route.ts`

## Hardening Applied In Slice C - Part 13
- Added parity hardening (origin allow-list + IP/user throttling parity) to:
  - `src/app/api/abuse/report/manage/route.ts`

## Hardening Applied In Slice C - Part 14
- Added parity hardening (origin allow-list + IP/user throttling parity) to:
  - `src/app/api/uploads/sign/route.ts`

## Hardening Applied In Slice C - Part 15
- Added parity hardening (GET list IP/user throttling + service-role client auth options parity) to:
  - `src/app/api/sponsors/services/route.ts`

## Hardening Applied In Slice C - Part 16
- Added parity hardening (service-role client auth options parity) to:
  - `src/app/api/sponsors/services/[offerId]/route.ts`

## Hardening Applied In Slice C - Part 17
- Added parity hardening (service-role client auth options parity) to:
  - `src/app/api/sponsors/store/route.ts`

## Hardening Applied In Slice C - Part 18
- Added parity hardening (service-role client auth options parity) to:
  - `src/app/api/products/[id]/route.ts`

## Hardening Applied In Slice C - Part 19
- Added parity hardening (service-role client auth options parity) to:
  - `src/app/api/uploads/route.ts`

## Hardening Applied In Slice C - Part 20
- Added parity hardening (service-role client auth options parity) to:
  - `src/app/api/products/[id]/sold/route.ts`

## Hardening Applied In Slice C - Part 21
- Added parity hardening (service-role client auth options parity) to:
  - `src/app/api/products/translate/route.ts`

## Hardening Applied In Slice C - Part 22
- Added parity hardening (GET read-path IP/user throttling parity) to:
  - `src/app/api/admin/app-contacts/route.ts`

## Hardening Applied In Slice C - Part 23
- Added parity hardening (GET read-path IP/user throttling parity) to:
  - `src/app/api/admin/app-settings/sponsor-live-stats/route.ts`

## Hardening Applied In Slice C - Part 24
- Completed Priority 1 service-role reduction (`search_click_events`):
  - Added RLS insert policies via migration:
    - `supabase/migrations/20260223100328_search_click_events_rls_insert_policies.sql`
  - Moved route insert path to scoped auth client (removed service-role dependency):
    - `src/app/api/search/click/route.ts`

## Hardening Applied In Slice C - Part 25
- Completed first Priority 2 message-route reduction slice:
  - Added secure message-history RPC via migration:
    - `supabase/migrations/20260223110158_messages_conversation_messages_secure_rpc.sql`
  - Moved message-history route to scoped RPC path (removed service-role dependency):
    - `src/app/api/messages/conversations/[id]/messages/route.ts`

## Hardening Applied In Slice C - Part 26
- Completed second Priority 2 message-route reduction slice:
  - Added secure conversation-detail RPC via migration:
    - `supabase/migrations/20260223113222_messages_conversation_detail_secure_rpc.sql`
  - Moved conversation-detail GET path to scoped RPC path:
    - `src/app/api/messages/conversations/[id]/route.ts` (GET)
  - DELETE path remains service-role for now:
    - `src/app/api/messages/conversations/[id]/route.ts` (DELETE)

## Hardening Applied In Slice C - Part 27
- Completed third Priority 2 message-route reduction slice:
  - Added secure conversation-list RPC via migration:
    - `supabase/migrations/20260223120007_messages_conversation_summaries_secure_rpc.sql`
  - Moved conversation-list GET path to scoped RPC path:
    - `src/app/api/messages/conversations/route.ts`
  - Locked legacy list RPC execute surface to `service_role` only:
    - `public.list_conversation_summaries(uuid)`

## Hardening Applied In Slice C - Part 28
- Completed fourth Priority 2 message-route reduction slice:
  - Added secure conversation-read RPC via migration:
    - `supabase/migrations/20260223122014_messages_mark_conversation_read_secure_rpc.sql`
  - Moved conversation-read POST path to scoped RPC path:
    - `src/app/api/messages/conversations/[id]/read/route.ts`

## Hardening Applied In Slice C - Part 29
- Completed fifth Priority 2 message-route reduction slice:
  - Added secure message-delete RPC via migration:
    - `supabase/migrations/20260223124555_messages_delete_secure_rpc.sql`
  - Moved message-delete route to scoped RPC path:
    - `src/app/api/messages/[id]/route.ts`

## Hardening Applied In Slice C - Part 30
- Completed sixth Priority 2 message-route reduction slice:
  - Added secure conversation-delete RPC via migration:
    - `supabase/migrations/20260223131619_messages_delete_conversation_secure_rpc.sql`
  - Moved conversation-delete route to scoped RPC path:
    - `src/app/api/messages/conversations/[id]/route.ts` (DELETE)

## Hardening Applied In Slice C - Part 31
- Completed first non-message replaceable-later reduction slice:
  - Removed normal service-role write path from:
    - `src/app/api/partnerships/route.ts`
  - Partnership inquiry inserts now use scoped auth/anon path through existing RLS policy.

## Hardening Applied In Slice C - Part 32
- Completed second non-message replaceable-later reduction slice:
  - Added click-event RLS insert policies via migration:
    - `supabase/migrations/20260223135330_sponsor_store_click_events_rls_insert_policies.sql`
  - Removed normal service-role write path from:
    - `src/app/api/sponsors/stats/click/route.ts`
  - Sponsor click-event inserts now use scoped auth/anon path through RLS policies.

## Hardening Applied In Slice C - Part 33
- Completed third non-message replaceable-later reduction slice:
  - Reduced routine service-role dependency in:
    - `src/app/api/health/route.ts`
  - Public health checks now run with scoped low-privilege client path.
  - Service-role path is retained only for privileged token-auth diagnostics.

## Hardening Applied In Slice C - Part 34
- Completed fourth non-message replaceable-later reduction slice:
  - Added abuse-report trigger hardening migration:
    - `supabase/migrations/20260223141414_abuse_reports_handle_auto_flag_secure_trigger_actions.sql`
  - Removed route-level service-role side effects from:
    - `src/app/api/abuse/report/route.ts`
  - Auto-flag side effects now execute inside DB trigger path.

## Hardening Applied In Slice C - Part 35
- Completed fifth non-message replaceable-later reduction slice:
  - Added secure Algolia sync read RPC migration:
    - `supabase/migrations/20260223145649_algolia_sync_secure_product_row_rpc.sql`
  - Removed route-level service-role product read path from:
    - `src/app/api/search/algolia-sync/route.ts`
  - Algolia sync row fetch now uses scoped auth RPC path with DB-side owner/moderator checks.

## Hardening Applied In Slice C - Part 36
- Completed sixth non-message replaceable-later reduction slice:
  - Split health paths:
    - `src/app/api/health/route.ts` now public low-priv only,
    - `src/app/api/internal/health/route.ts` handles token-protected privileged diagnostics.
  - Public health route no longer includes service-role path.

## Hardening Applied In Slice C - Part 37
- Completed required-now sponsor-admin route hardening slice:
  - Tightened mutation abuse controls in:
    - `src/app/api/admin/sponsors/stores/route.ts`
      - stricter create IP/user limits,
      - per-slug create throttle,
      - create payload size guard.
    - `src/app/api/admin/sponsors/stores/[storeId]/status/route.ts`
      - stricter status IP/user limits,
      - per-store status-flip throttle,
      - status payload size guard.
  - Added structured abuse logging for these rate-limit paths.

## Hardening Applied In Slice C - Part 38
- Completed required-now closeout parity sweep and one uncovered-gap fix:
  - Patched moderator hard-delete route:
    - `src/app/api/products/[id]/route.ts`
      - added origin allow-list enforcement,
      - added per-IP and per-user delete throttling,
      - added strict UUID route-param validation before privileged delete path.
  - Sweep result:
    - no additional untracked high-exposure guard gaps found in required-now routes during this pass.

## Hardening Applied In Slice C - Part 39
- Completed Phase 4 closeout documentation and Phase 5 kickoff prep:
  - Added residual-risk register:
    - `docs/security/PHASE4_CLOSEOUT_RESIDUAL_RISKS.md`
  - Added Phase 5 first-slice checklist:
    - `docs/security/PHASE5_SLICE_A_PART1_CHECKLIST.md`
  - Documented by-design required-now risks and concrete operational follow-up steps.

## Next Priorities
1. Execute Phase 5 Slice A Part 1 dependency baseline and triage.
2. Draft and validate secret-rotation runbook using staging-first rollout.
3. Define monitoring ownership and alert thresholds for privileged-route abuse signals.
