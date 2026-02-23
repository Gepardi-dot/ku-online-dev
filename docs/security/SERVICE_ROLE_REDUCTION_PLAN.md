# Service-Role Reduction Plan (Phase 4)

Last updated: `2026-02-23`
Status: `Priority 1 and Priority 2 implemented locally; Priority 3 reduction complete; required-now re-audit closeout documented (Part 39 complete)`

## Goal
Reduce app dependence on Supabase service-role clients by moving eligible routes to scoped auth + RLS or constrained RPCs.

## Non-Goals (This Document)
- No schema/policy changes are executed here.
- No production/staging apply actions are performed here.

## Priority 1: `search_click_events` Path

### Current
- Route: `src/app/api/search/click/route.ts`
- Behavior: event insert now runs via scoped client + RLS policies.
- Existing hardening: origin checks + IP/user rate limits + payload validation.

### Completed in Slice C - Part 24 (Local)
1. Migration generated:
   - `supabase/migrations/20260223100328_search_click_events_rls_insert_policies.sql`
2. DB/RLS applied:
   - authenticated insert policy: `auth.uid() = user_id`
   - anonymous insert policy: `user_id is null`
3. App route updated:
   - removed service-role insert path
   - route now inserts with scoped client in `src/app/api/search/click/route.ts`
4. Validation run:
   - `supabase db diff -f search_click_events_rls_insert_policies`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)
   - `npm exec -- eslint "src/app/api/search/click/route.ts"`
   - `npm run typecheck`

## Priority 2: Message Routes

### Current
- Routes:
  - `src/app/api/messages/conversations/[id]/route.ts`
- Behavior: targeted GET/DELETE flow is now migrated to scoped RPC path (no standard service-role path remains).

### Completed in Slice C - Part 25 (Local)
1. Migration generated:
   - `supabase/migrations/20260223110158_messages_conversation_messages_secure_rpc.sql`
2. DB/RPC added:
   - `public.list_conversation_messages_secure(...)` with participant guard on `auth.uid()`
3. App route updated:
   - `src/app/api/messages/conversations/[id]/messages/route.ts` now uses scoped RPC path
4. Validation run:
   - `supabase db diff -f messages_conversation_messages_secure_rpc`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)
   - `npm exec -- eslint "src/app/api/messages/conversations/[id]/messages/route.ts"`
   - `npm run typecheck`

### Completed in Slice C - Part 26 (Local)
1. Migration generated:
   - `supabase/migrations/20260223113222_messages_conversation_detail_secure_rpc.sql`
2. DB/RPC added:
   - `public.get_conversation_detail_secure(...)` with participant guard on `auth.uid()`
3. App route updated:
   - `src/app/api/messages/conversations/[id]/route.ts` GET now uses scoped RPC path
4. Validation run:
   - `supabase db diff -f messages_conversation_detail_secure_rpc`
   - `npm exec -- eslint "src/app/api/messages/conversations/[id]/route.ts"`
   - `npm run typecheck`
   - `supabase db reset` (local stack restart failed after seed with `502 upstream`; migrations applied)
   - `supabase db diff` (no schema changes found)

### Completed in Slice C - Part 27 (Local)
1. Migration generated:
   - `supabase/migrations/20260223120007_messages_conversation_summaries_secure_rpc.sql`
2. DB/RPC added:
   - `public.list_conversation_summaries_secure()` with caller guard on `auth.uid()`
3. DB hardening added:
   - revoked `anon/public/authenticated` execute on legacy `public.list_conversation_summaries(uuid)`
   - kept legacy execute only for `service_role`
4. App route updated:
   - `src/app/api/messages/conversations/route.ts` GET now uses scoped secure RPC path
5. Validation run:
   - `supabase db diff -f messages_conversation_summaries_secure_rpc`
   - `npm exec -- eslint "src/app/api/messages/conversations/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Completed in Slice C - Part 28 (Local)
1. Migration generated:
   - `supabase/migrations/20260223122014_messages_mark_conversation_read_secure_rpc.sql`
2. DB/RPC added:
   - `public.mark_conversation_read_secure(p_conversation_id)` with participant + receiver guard on `auth.uid()`
3. App route updated:
   - `src/app/api/messages/conversations/[id]/read/route.ts` POST now uses scoped secure RPC path
4. Validation run:
   - `supabase db diff -f messages_mark_conversation_read_secure_rpc`
   - `npm exec -- eslint "src/app/api/messages/conversations/[id]/read/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Completed in Slice C - Part 29 (Local)
1. Migration generated:
   - `supabase/migrations/20260223124555_messages_delete_secure_rpc.sql`
2. DB/RPC added:
   - `public.delete_message_secure(p_message_id)` with sender guard on `auth.uid()`
   - includes conversation `last_message` / `last_message_at` refresh after delete
3. App route updated:
   - `src/app/api/messages/[id]/route.ts` DELETE now uses scoped secure RPC path
4. Validation run:
   - `supabase db diff -f messages_delete_secure_rpc`
   - `npm exec -- eslint "src/app/api/messages/[id]/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Completed in Slice C - Part 30 (Local)
1. Migration generated:
   - `supabase/migrations/20260223131619_messages_delete_conversation_secure_rpc.sql`
2. DB/RPC added:
   - `public.delete_conversation_secure(p_conversation_id)` with participant guard on `auth.uid()`
3. App route updated:
   - `src/app/api/messages/conversations/[id]/route.ts` DELETE now uses scoped secure RPC path
4. Validation run:
   - `supabase db diff -f messages_delete_conversation_secure_rpc`
   - `npm exec -- eslint "src/app/api/messages/conversations/[id]/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Target
- Move to constrained RPC + scoped auth model:
  - RPC validates `auth.uid()` as participant.
  - Route invokes RPC with user-scoped client where possible.
  - Service-role only retained for irreducible admin/system paths.

### Planned DB work
1. Add/extend conversation/message RPCs with explicit auth checks:
   - list/detail/messages/read/update summary/delete flow.
2. Ensure RPC result shape is stable for API response mapping.
3. Keep policies minimal and deny broad direct table reads where RPC should mediate.

### Planned app changes
1. Replace direct service-role table queries with RPC calls.
2. Keep existing request hardening (origin + IP/user rate limits).
3. Keep same API response contract for frontend compatibility.

### Validation
1. Local migration reset and chat regression checks.
2. Participant isolation tests (seller/buyer vs non-participant).
3. Performance comparison (RPC vs existing path).

## Priority 3: Replaceable-Later Route Reduction

### Current
- Route:
  - `src/app/api/partnerships/route.ts`
- Behavior before this slice:
  - used service-role client for standard partnership inquiry writes.

### Completed in Slice C - Part 31 (Local)
1. App route updated:
   - `src/app/api/partnerships/route.ts` now inserts inquiries via scoped auth/anon client path.
2. Service-role reduction applied:
   - removed normal service-role DB write dependency from partnership submits.
3. Validation run:
   - `npm exec -- eslint "src/app/api/partnerships/route.ts"`
   - `npm run typecheck`

### Completed in Slice C - Part 32 (Local)
1. Migration generated:
   - `supabase/migrations/20260223135330_sponsor_store_click_events_rls_insert_policies.sql`
2. DB/RLS added:
   - `sponsor_store_click_events_insert_anonymous`
   - `sponsor_store_click_events_insert_authenticated`
   - both restrict source values and require active sponsor store target.
3. App route updated:
   - `src/app/api/sponsors/stats/click/route.ts` POST now inserts via scoped auth/anon client path.
4. Validation run:
   - `supabase db diff -f sponsor_store_click_events_rls_insert_policies`
   - `npm exec -- eslint "src/app/api/sponsors/stats/click/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Next Target
1. `src/app/api/health/route.ts`
2. Goal:
   - reduce/remove routine service-role dependency for public health signal.
3. Validation:
   - lint/typecheck, plus local DB reproducibility checks only if migration is introduced.

### Completed in Slice C - Part 33 (Local)
1. App route updated:
   - `src/app/api/health/route.ts`
2. Service-role reduction applied:
   - public health checks now use scoped low-privilege client path,
   - service-role diagnostics path is now token-gated and no longer routine.
3. Additional hardening:
   - per-IP rate limiting for health endpoint,
   - safe error labels in response with detailed failures logged server-side.
4. Validation run:
   - `npm exec -- eslint "src/app/api/health/route.ts"`
   - `npm run typecheck`

### Next Target
1. `src/app/api/abuse/report/route.ts`
2. Goal:
   - reduce normal user-submit service-role dependency while preserving required moderation/system actions.
3. Validation:
   - lint/typecheck, plus local DB reproducibility checks only if migration is introduced.

### Completed in Slice C - Part 34 (Local)
1. Migration generated:
   - `supabase/migrations/20260223141414_abuse_reports_handle_auto_flag_secure_trigger_actions.sql`
2. DB/trigger hardening applied:
   - updated `public.handle_abuse_report()` to execute auto-flag side effects in DB trigger path,
   - includes auto-hide product action and auto-flag notifications for seller/reporter.
3. App route updated:
   - `src/app/api/abuse/report/route.ts` no longer performs route-level service-role side effects.
4. Validation run:
   - `supabase db diff -f abuse_reports_handle_auto_flag_secure_trigger_actions`
   - `npm exec -- eslint "src/app/api/abuse/report/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Next Target
1. `src/app/api/search/algolia-sync/route.ts`
2. Goal:
   - reduce/narrow service-role exposure in sync flow while preserving index synchronization.
3. Validation:
   - lint/typecheck, plus local DB reproducibility checks only if migration is introduced.

### Completed in Slice C - Part 35 (Local)
1. Migration generated:
   - `supabase/migrations/20260223145649_algolia_sync_secure_product_row_rpc.sql`
2. DB/RPC added:
   - `public.get_algolia_product_row_secure(p_product_id)` with owner/moderator guard on `auth.uid()`/JWT role.
3. App route updated:
   - `src/app/api/search/algolia-sync/route.ts` now loads product row through scoped secure RPC path.
4. Validation run:
   - `supabase db diff -f algolia_sync_secure_product_row_rpc`
   - `npm exec -- eslint "src/app/api/search/algolia-sync/route.ts"`
   - `npm run typecheck`
   - `supabase db reset`
   - `supabase db diff` (no schema changes found)

### Next Target
1. `src/app/api/health/route.ts`
2. Goal:
   - fully isolate/remove service-role code from public health endpoint path.
3. Validation:
   - lint/typecheck, plus local DB reproducibility checks only if migration is introduced.

### Completed in Slice C - Part 36 (Local)
1. App routes updated:
   - `src/app/api/health/route.ts` now public low-priv only.
   - `src/app/api/internal/health/route.ts` now provides token-protected privileged diagnostics.
2. Service-role isolation applied:
   - public health route no longer contains service-role code path.
3. Additional hardening:
   - internal diagnostics route uses origin allow-list + token/IP rate limits.
4. Validation run:
   - `npm exec -- eslint "src/app/api/health/route.ts" "src/app/api/internal/health/route.ts"`
   - `npm run typecheck`

### Completed in Slice C - Part 37 (Local)
1. App routes updated:
   - `src/app/api/admin/sponsors/stores/route.ts`
   - `src/app/api/admin/sponsors/stores/[storeId]/status/route.ts`
2. Required-now request-layer hardening applied:
   - tightened create/status IP and user throttles,
   - added per-slug create throttle,
   - added per-store status-change throttle,
   - added mutation payload size caps with early reject.
3. Validation run:
   - `npm exec -- eslint "src/app/api/admin/sponsors/stores/route.ts" "src/app/api/admin/sponsors/stores/[storeId]/status/route.ts"`
   - `npm run typecheck`

### Completed in Slice C - Part 38 (Local)
1. Required-now parity sweep completed (auth/origin/throttle/input guard pass).
2. App route updated:
   - `src/app/api/products/[id]/route.ts`
3. Hardening applied:
   - added origin allow-list guard,
   - added per-IP + per-user delete throttles,
   - added UUID validation on route param before privileged delete path.
4. Validation run:
   - `npm exec -- eslint "src/app/api/products/[id]/route.ts"`
   - `npm run typecheck`

### Completed in Slice C - Part 39 (Local)
1. Added closeout residual-risk register:
   - `docs/security/PHASE4_CLOSEOUT_RESIDUAL_RISKS.md`
2. Added Phase 5 kickoff checklist:
   - `docs/security/PHASE5_SLICE_A_PART1_CHECKLIST.md`
3. Documented operational next steps:
   - dependency triage baseline,
   - secret-rotation runbook draft,
   - monitoring ownership and alert thresholds.
4. Validation run:
   - `npm run typecheck`

### Next Target
1. Phase 5 Slice A - Part 1 execution.
2. Goal:
   - produce dependency/secret/monitoring baseline artifacts and first remediation batch.
3. Validation:
   - verify generated artifacts and keep typecheck green.

## Rollout Sequence
1. Priority 1 (`search_click_events`) completed locally in Slice C - Part 24.
2. Priority 2 started in Slice C - Part 25 (message history route).
3. Priority 2 continued in Slice C - Part 26 (conversation detail GET route).
4. Priority 2 continued in Slice C - Part 27 (conversation list GET route + legacy RPC execute lockdown).
5. Priority 2 continued in Slice C - Part 28 (conversation read POST route).
6. Priority 2 continued in Slice C - Part 29 (message delete route).
7. Priority 2 completed in Slice C - Part 30 (conversation delete route).
8. Priority 3 started in Slice C - Part 31 (`partnerships` route scoped insert path).
9. Priority 3 continued in Slice C - Part 32 (`sponsors/stats/click` route scoped insert path + RLS policies).
10. Priority 3 continued in Slice C - Part 33 (`health` route reduced routine service-role usage with token-gated diagnostics).
11. Priority 3 continued in Slice C - Part 34 (`abuse/report` route service-role side effects moved into DB trigger path).
12. Priority 3 continued in Slice C - Part 35 (`search/algolia-sync` route moved to scoped secure RPC read path).
13. Priority 3 continued in Slice C - Part 36 (public health split from token-protected internal diagnostics).
14. Required-now re-audit started and continued in Slice C - Part 37 (`admin/sponsors/stores` create/status hardening).
15. Required-now re-audit closeout continued in Slice C - Part 38 (`products/[id]` delete request-layer hardening).
16. Phase 4 closeout documentation completed in Slice C - Part 39 (residual-risk + Phase 5 kickoff checklist).
17. Next target: Phase 5 Slice A - Part 1 execution (dependency/secrets/monitoring baseline).
18. Update `docs/security/SERVICE_ROLE_INVENTORY.md` after each slice to keep required-now hardening status current.

## Risk Notes
- Tightening policies too early can break active flows; rollout should be route-by-route.
- RPC compatibility and schema drift must be validated locally with reset reproducibility.
- Keep service-role fallback only as temporary and explicitly documented.
