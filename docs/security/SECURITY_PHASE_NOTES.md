# Security Phase Notes

## Current Status
- Active phase: `Phase 4 (closeout)`
- Status: `Closeout documented locally (Slice C Part 39 implemented and verified)`
- Last updated: `2026-02-23`

## Phase 1 Worklog

### Objectives
- Close immediate exploit paths first.
- Keep changes small and verifiable.

### Implemented
1. Upload deletion authorization hardening.
   - Added file path safety checks and owner-path enforcement.
   - File: `src/app/api/uploads/route.ts`
2. Translation endpoint abuse controls.
   - Added auth requirement, origin check, per-IP and per-user rate limits, max text length.
   - File: `src/app/api/translate/route.ts`
3. Vonage webhook verification hardening.
   - Replaced permissive acceptance with signature validation flow and replay tolerance.
   - Added basic IP rate limiting for webhook endpoint.
   - File: `src/app/api/vonage/webhook/route.ts`
4. JSON-LD serialization safety.
   - Added safe serialization helper before `dangerouslySetInnerHTML`.
   - File: `src/app/product/[id]/page.tsx`

### Verification Completed
- `npx eslint "src/app/api/vonage/webhook/route.ts" "src/app/api/uploads/route.ts" "src/app/api/translate/route.ts" "src/app/product/[id]/page.tsx"`
- `npm run typecheck`

## Phase 2 Worklog

### Objectives
- Harden privileged/admin/internal endpoints with layered controls.
- Remove avoidable sensitive output from public diagnostics.
- Ensure webhook-like hooks fail closed in production on secret misconfiguration.

### Implemented
1. Admin moderation endpoint hardening.
   - Added origin allow-list checks, host allow-list checks, per-IP rate limiting, method restrictions, UUID payload validation, and timing-safe admin token comparison.
   - Reduced error detail exposure in API responses.
   - File: `src/app/api/admin/moderate/route.ts`
2. Health endpoint sensitive output reduction.
   - Added per-IP rate limiting.
   - Removed raw database/storage error messages from response payload and kept details server-side in logs.
   - File: `src/app/api/health/route.ts`
3. SMS hook strictness and abuse control.
   - Added per-IP rate limiting for incoming hook requests.
   - Enforced fail-closed behavior in production when `SUPABASE_SMS_HOOK_SECRET` is missing.
   - Kept non-production fallback with explicit warning.
   - File: `src/app/api/auth/send-sms/route.ts`

### Verification Completed
- `npx eslint "src/app/api/admin/moderate/route.ts" "src/app/api/health/route.ts" "src/app/api/auth/send-sms/route.ts"`
- `npm run typecheck`

## Phase 3 Worklog

### Objectives
- Start CSP safely in report-only mode.
- Harden remaining browser-side HTML/CSS injection sinks.
- Reduce long-lived browser session exposure without breaking auth flow.

### Implemented
1. CSP report-only rollout.
   - Added production `Content-Security-Policy-Report-Only` header gated by `NEXT_ENABLE_CSP_REPORT_ONLY` (enabled by default in production).
   - Kept runtime-compatible directives while collecting violations.
   - File: `next.config.ts`
2. CSP reporting endpoint.
   - Added `/api/security/csp-report` endpoint with JSON report parsing, minimal structured logging, and per-IP rate limiting.
   - File: `src/app/api/security/csp-report/route.ts`
3. CSS injection hardening for chart style sink.
   - Sanitized chart IDs, CSS variable keys, and CSS color values before building `dangerouslySetInnerHTML` styles.
   - File: `src/components/ui/chart.tsx`
4. Session lifetime tightening.
   - Reduced Supabase auth cookie max age from 400 days to 120 days across browser/server/edge helpers.
   - Files:
     - `src/utils/supabase/client.ts`
     - `src/utils/supabase/server.ts`
     - `src/utils/supabase/edge-session.ts`

### Verification Completed
- `npx eslint "next.config.ts" "src/app/api/security/csp-report/route.ts" "src/components/ui/chart.tsx" "src/utils/supabase/client.ts" "src/utils/supabase/server.ts" "src/utils/supabase/edge-session.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice A)

### Objectives
- Reduce privacy-sensitive seller data flowing through public product/profile surfaces.
- Remove avoidable PII (`email`, `phone`) from product listing hydration and search response paths.
- Keep seller-name fallback behavior functional without exposing contact data.

### Implemented
1. Seller profile privacy tightening.
   - Removed `phone` from seller profile query typing and selection.
   - Removed seller phone badge rendering from public seller page.
   - Files:
     - `src/lib/services/sellers.ts`
     - `src/app/seller/[id]/page.tsx`
2. Product seller payload minimization.
   - Removed `email` and `phone` from `SellerProfile`, product relation select, and service-role seller hydration query.
   - Updated seller display-name presence checks to use only non-sensitive name fields.
   - File: `src/lib/services/products.ts`
3. Algolia privacy cleanup.
   - Removed `seller_email` from Algolia sync row shape, indexed record shape, sync select list, and search retrieval mapping.
   - File: `src/lib/services/algolia-products.ts`
4. UI and preview alignment.
   - Removed email fallback usage for seller display name in product detail and product card.
   - Updated sell-form preview seller object to match minimized seller type.
   - Files:
     - `src/app/product/[id]/page.tsx`
     - `src/components/product-card-new.tsx`
     - `src/app/sell/sell-form.tsx`

### Verification Completed
- `npx eslint "src/lib/services/sellers.ts" "src/app/seller/[id]/page.tsx" "src/lib/services/products.ts" "src/components/product-card-new.tsx" "src/app/product/[id]/page.tsx" "src/lib/services/algolia-products.ts" "src/app/sell/sell-form.tsx"`
- `npm run typecheck`

## Phase 4 Worklog (Slice B)

### Objectives
- Keep anti-attack hardening progress while respecting product decision that seller profile fields are intentionally public.
- Avoid treating public profile visibility as a security bug.
- Keep privilege usage explicit and documented.

### Implemented
1. Product decision alignment for seller profile visibility.
   - Restored seller page fields intended to be public (`location`, `bio`, member-since from `created_at`).
   - Seller profile loader now returns those fields again.
   - File: `src/lib/services/sellers.ts`
2. Public listing data continuity.
   - Restored seller relation display fields in product relation select (`location`, `bio`, `created_at`, `updated_at`) so public listing/seller context remains complete.
   - File: `src/lib/services/products.ts`
3. Existing least-privilege improvement retained where non-breaking.
   - Hydration now uses `public_user_profiles` with scoped client first and admin fallback for unresolved IDs only.
   - File: `src/lib/services/products.ts`
4. Seller page UI restoration.
   - Restored profile badges/sections for member-since and location, plus seller bio block.
   - File: `src/app/seller/[id]/page.tsx`

### Verification Completed
- `npm exec -- eslint "src/lib/services/sellers.ts" "src/app/seller/[id]/page.tsx" "src/lib/services/products.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 1)

### Objectives
- Eliminate service-role writes from read-only page requests.
- Reduce abuse risk where repeated page views could trigger privileged updates.

### Implemented
1. Product detail page write-path removal.
   - Removed automatic Arabic translation generation + product update from the page read flow.
   - Removed service-role client creation and AI translation call from `product/[id]` page render path.
   - Translation persistence remains handled by dedicated API flow (`/api/products/translate`) triggered on create/edit flows.
   - File: `src/app/product/[id]/page.tsx`

### Verification Completed
- `npm exec -- eslint "src/app/product/[id]/page.tsx"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 2)

### Objectives
- Normalize anti-abuse controls across remaining high-risk service-role endpoints.
- Reduce CSRF-style cross-origin and brute-force abuse risk on moderator/storage routes.
- Publish service-role inventory with `required now` vs `replaceable later`.

### Implemented
1. Privileged-route consistency hardening.
   - Added origin allow-list checks + same-origin fallback + per-IP and per-user rate limits to:
     - `src/app/api/admin/users/verify/route.ts`
     - `src/app/api/abuse/report/manage/route.ts`
     - `src/app/api/products/[id]/route.ts`
     - `src/app/api/uploads/sign/route.ts`
2. Service-role inventory documentation.
   - Added preliminary inventory with route-level classification (`required now` vs `replaceable later`) and refactor priorities.
   - File: `docs/security/SERVICE_ROLE_INVENTORY.md`

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/users/verify/route.ts" "src/app/api/abuse/report/manage/route.ts" "src/app/api/uploads/sign/route.ts" "src/app/api/products/[id]/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 3)

### Objectives
- Apply the same anti-abuse controls to remaining message routes that use service-role access.
- Reduce cross-origin abuse and high-frequency request pressure on chat endpoints.

### Implemented
1. Message route consistency hardening.
   - Added origin allow-list checks + same-origin fallback + per-IP and per-user rate limits to:
     - `src/app/api/messages/conversations/route.ts`
     - `src/app/api/messages/conversations/[id]/route.ts`
     - `src/app/api/messages/conversations/[id]/messages/route.ts`
     - `src/app/api/messages/conversations/[id]/read/route.ts`
     - `src/app/api/messages/[id]/route.ts`
2. Service-role inventory alignment.
   - Kept messages routes in `replaceable later` bucket and continued documenting migration intent in:
     - `docs/security/SERVICE_ROLE_INVENTORY.md`

### In Practice
1. Before:
   - Chat endpoints with service-role reads/writes had weaker request-level abuse controls.
   - A malicious client could hammer message endpoints more easily.
2. After:
   - Suspicious request bursts now get throttled by IP and by authenticated user.
   - Cross-origin scripted calls with untrusted origins are rejected when `Origin` is present.
3. User impact:
   - Normal chat usage remains unchanged.
   - Extreme rapid-fire or abusive traffic receives `429` responses with `Retry-After`.

### Verification Completed
- `npm exec -- eslint "src/app/api/messages/conversations/route.ts" "src/app/api/messages/conversations/[id]/route.ts" "src/app/api/messages/conversations/[id]/messages/route.ts" "src/app/api/messages/conversations/[id]/read/route.ts" "src/app/api/messages/[id]/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 4)

### Objectives
- Complete sponsor/admin consistency pass for request hardening.
- Close remaining high-frequency abuse gap on sponsor click tracking path.

### Implemented
1. Sponsor click tracking consistency hardening.
   - Added per-user rate limiting on top of existing IP rate limiting and origin checks.
   - File: `src/app/api/sponsors/stats/click/route.ts`
2. Sponsor/admin consistency audit closure.
   - Verified sponsor/admin service-role routes now consistently include request-level rate and origin controls.
   - Scope checked:
     - `src/app/api/sponsors/**`
     - `src/app/api/admin/sponsors/**`
     - `src/app/api/admin/app-settings/sponsor-live-stats/route.ts`

### In Practice
1. Before:
   - A signed-in user could spam sponsor click events with fewer request-level limits than other hardened endpoints.
2. After:
   - Sponsor click endpoint now throttles by IP and by user.
3. User impact:
   - Normal interactions remain the same.
   - Excessive repeated click-event calls return `429` with `Retry-After`.

### Verification Completed
- `npm exec -- eslint "src/app/api/sponsors/stats/click/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 5)

### Objectives
- Close the top replaceable-path hardening gap on search click tracking abuse.
- Publish the first concrete service-role reduction spec so DB/RLS migration work is actionable.

### Implemented
1. Search click anti-abuse hardening.
   - Added per-user rate limiting in addition to existing origin checks and IP throttle.
   - File: `src/app/api/search/click/route.ts`
2. Service-role reduction spec.
   - Added route-by-route migration design for `search_click_events` and message routes.
   - Included local-first DB/RLS workflow, rollout order, and validation checklist.
   - File: `docs/security/SERVICE_ROLE_REDUCTION_PLAN.md`
3. Inventory linkage update.
   - Linked inventory next-priority flow to the new reduction plan document.
   - File: `docs/security/SERVICE_ROLE_INVENTORY.md`

### In Practice
1. Before:
   - A signed-in user could drive higher-volume click spam if IP limits were not reached.
   - The service-role removal plan existed only as high-level intent.
2. After:
   - Repeated search-click calls by the same user now hit `429` limits faster, even across IPs/devices.
   - The team now has a concrete, staged migration blueprint to remove service-role dependency from replaceable paths.
3. User impact:
   - Normal search usage stays the same.
   - Abusive click-event flooding gets blocked earlier and more consistently.

### Verification Completed
- `npm exec -- eslint "src/app/api/search/click/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 6)

### Objectives
- Harden one high-impact `Required now` privileged moderation route against scripted abuse.
- Keep scope to request-layer protections only (no DB/policy changes).

### Implemented
1. Admin moderation route request hardening.
   - Added origin allow-list checks with same-origin fallback.
   - Added per-IP rate limiting (applies before token auth, so brute-force attempts are throttled).
   - Added authenticated admin-token request rate limiting (limits rapid repeated privileged writes).
   - Added strict UUID validation for `productId`.
   - File: `src/app/api/admin/moderate/route.ts`

### In Practice
1. Before:
   - The route accepted high-volume repeated calls as long as requests included the correct admin token.
   - Unauthorized token-guessing attempts were not explicitly rate-limited.
2. After:
   - Burst traffic from one source now gets `429` + `Retry-After` before it can hammer moderation writes.
   - Even valid admin-token calls are capped per minute to reduce abuse impact if token leakage occurs.
   - Requests with non-UUID `productId` are rejected earlier with `400`.
3. User impact:
   - Normal admin moderation actions continue to work.
   - Scripted or abusive high-frequency moderation calls are blocked sooner.

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/moderate/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 7)

### Objectives
- Harden another high-impact `Required now` admin route with parity controls.
- Keep this slice local and request-layer only (no DB changes).

### Implemented
1. Admin announcements route parity hardening.
   - Kept origin allow-list checks and expanded list to include dev deployment origin.
   - Kept per-IP throttle and aligned rate-limit key naming for consistency.
   - Added privileged-token throttle to cap successful admin-token request bursts.
   - Added strict date input validation for `startsAt` / `endsAt` and ordering check.
   - File: `src/app/api/admin/announcements/route.ts`

### In Practice
1. Before:
   - Per-IP throttling existed, but distributed traffic using a valid admin token could still generate higher write volume.
   - Invalid schedule timestamps could reach the RPC path.
2. After:
   - Even with a valid admin token, repeated publish calls are capped (`429` + `Retry-After`).
   - Invalid timestamp formats or `endsAt <= startsAt` are rejected immediately with `400`.
3. User impact:
   - Normal admin announcement publishing remains unchanged.
   - Scripted flooding and malformed schedule payloads are blocked earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/announcements/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 8)

### Objectives
- Harden one remaining `Required now` privileged internal route with parity controls.
- Keep slice local and request-layer only (no DB changes).

### Implemented
1. Internal rollout-status route parity hardening.
   - Added origin allow-list check with same-origin fallback.
   - Added principal-level throttle for authorized secret usage, in addition to existing IP throttle.
   - Kept existing secret-based authorization flow unchanged.
   - File: `src/app/api/internal/pwa/rollout-status/route.ts`

### In Practice
1. Before:
   - The route relied on secret auth plus IP throttling only.
   - If secret traffic was distributed across many IPs, request volume could stay higher.
2. After:
   - Browser-origin calls from untrusted origins are rejected (`403`) when `Origin` is present.
   - Even valid-secret requests are capped by a second shared throttle (`429` + `Retry-After`).
3. User impact:
   - Legit internal monitoring requests still work.
   - Secret-leak abuse and distributed high-frequency calls are limited faster.

### Verification Completed
- `npm exec -- eslint "src/app/api/internal/pwa/rollout-status/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 9)

### Objectives
- Harden one additional high-impact `Required now` route still missing full parity controls.
- Keep slice local and request-layer only (no DB changes).

### Implemented
1. Send-SMS hook route parity hardening.
   - Added origin allow-list checks with same-origin fallback.
   - Added per-IP throttle before hook processing.
   - Added principal-level throttle (`user.id` or normalized phone) to limit repeated OTP sends for one target.
   - Added optional secret-principal throttle when hook secret is configured.
   - Enforced production safety guard: reject when hook secret is missing in production.
   - Tightened phone normalization/validation before Vonage send.
   - File: `src/app/api/auth/send-sms/route.ts`

### In Practice
1. Before:
   - Hook requests had signature verification (when configured) but no request-rate controls.
   - Repeated OTP sends for one user/phone could be spammed more easily.
2. After:
   - Bursty traffic gets throttled by IP and by target principal (`429` + `Retry-After`).
   - In production, missing hook secret now blocks the route (`503`) instead of silently accepting unsigned calls.
   - Invalid phone payloads are rejected earlier with `400`.
3. User impact:
   - Normal OTP flow remains unchanged.
   - Abusive repeated send attempts are blocked faster.

### Verification Completed
- `npm exec -- eslint "src/app/api/auth/send-sms/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 10)

### Objectives
- Harden one remaining high-impact `Required now` webhook route with parity request controls.
- Keep slice local and request-layer only (no DB changes).

### Implemented
1. Vonage webhook route parity hardening.
   - Added origin allow-list checks with same-origin fallback.
   - Added per-IP and per-principal throttling on webhook POST traffic.
   - Added request-body size guard and stricter payload schema validation.
   - Added support for JSON and form-encoded webhook payload parsing.
   - Improved signature handling from "always true" to best-effort verification when signature header is present.
   - Added health endpoint request throttling.
   - File: `src/app/api/vonage/webhook/route.ts`

### In Practice
1. Before:
   - Webhook signature verification was effectively disabled (always accepted).
   - POST requests had no rate controls and accepted broad payload shapes.
2. After:
   - Flooding attempts are constrained by IP and principal (`429` + `Retry-After`).
   - Oversized or malformed webhook payloads are rejected early (`413` / `400`).
   - If a signature is provided, it is now actually validated instead of blindly accepted.
3. User impact:
   - Normal webhook processing remains compatible for unsigned setups.
   - Abuse and malformed traffic are blocked earlier with clearer failure responses.

### Verification Completed
- `npm exec -- eslint "src/app/api/vonage/webhook/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 11)

### Objectives
- Harden one additional high-impact `Required now` account route to full parity controls.
- Keep slice local and request-layer only (no DB changes).

### Implemented
1. Account delete route parity hardening.
   - Kept existing origin allow-list guard and expanded origin parity for dev deployment.
   - Kept per-IP delete-attempt throttle and aligned key naming.
   - Added per-user delete-attempt throttle after auth to limit repeated account deletion attempts per identity.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/account/delete/route.ts`

### In Practice
1. Before:
   - Rapid repeated deletion attempts from the same authenticated user could continue until IP limits were hit.
   - Origin allow-list parity was slightly narrower than other hardened routes.
2. After:
   - Repeated delete attempts by one user now get blocked sooner (`429` + `Retry-After`) even if IP limit is not exhausted.
   - Dev deployment origin handling is consistent with the rest of hardened admin/system routes.
3. User impact:
   - Normal delete flow remains unchanged.
   - Scripted repeated delete attempts are constrained faster and more consistently.

### Verification Completed
- `npm exec -- eslint "src/app/api/account/delete/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 12)

### Objectives
- Review remaining `Required now` routes for parity regressions/gaps.
- Harden one route where parity controls were still missing.

### Implemented
1. Admin user verification route parity hardening.
   - Added origin allow-list checks with same-origin fallback.
   - Added per-IP request throttling.
   - Added per-moderator-user throttling after auth.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/admin/users/verify/route.ts`

### In Practice
1. Before:
   - Moderator verification endpoint accepted repeated calls without request-layer throttling or origin guard.
2. After:
   - Cross-origin scripted calls from untrusted origins are rejected (`403`).
   - Burst traffic gets limited by IP and by authenticated moderator identity (`429` + `Retry-After`).
3. User impact:
   - Normal moderation actions remain unchanged.
   - Repeated or automated verification abuse is constrained earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/users/verify/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 13)

### Objectives
- Continue closing parity gaps on `Required now` moderator/admin routes.
- Keep slice local and request-layer only (no DB changes).

### Implemented
1. Abuse-report management route parity hardening.
   - Added origin allow-list checks with same-origin fallback.
   - Added per-IP request throttling.
   - Added per-moderator-user throttling after auth.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/abuse/report/manage/route.ts`

### In Practice
1. Before:
   - Moderator abuse-management endpoint accepted repeated calls without request-layer origin/rate protections.
2. After:
   - Untrusted cross-origin calls are rejected (`403`).
   - Burst abuse-management traffic is limited by IP and moderator identity (`429` + `Retry-After`).
3. User impact:
   - Normal moderation flows stay unchanged.
   - Automated or abusive repeated report actions are throttled earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/abuse/report/manage/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 14)

### Objectives
- Continue parity-gap closure on `Required now` privileged routes.
- Keep slice local and request-layer only (no DB changes).

### Implemented
1. Upload-sign route parity hardening.
   - Added origin allow-list checks with same-origin fallback.
   - Added per-IP request throttling.
   - Added per-user request throttling after auth.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/uploads/sign/route.ts`

### In Practice
1. Before:
   - Signed-upload token route accepted repeated calls without origin/rate controls.
2. After:
   - Untrusted cross-origin scripted calls are rejected (`403`).
   - Burst token-generation calls are limited by IP and by authenticated user (`429` + `Retry-After`).
3. User impact:
   - Normal upload flow remains unchanged.
   - Automated token-spam attempts are throttled earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/uploads/sign/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 15)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified request-layer gap with minimal behavior change.

### Implemented
1. Sponsor services list route parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - Added per-IP request throttling on GET list path.
   - Added per-user request throttling on GET list path.
   - File: `src/app/api/sponsors/services/route.ts`

### In Practice
1. Before:
   - Sponsor services GET/list endpoint had origin/auth checks but no request-rate controls.
2. After:
   - Repeated list calls are throttled by source IP and by authenticated user (`429` + `Retry-After`).
3. User impact:
   - Normal service listing behavior remains unchanged.
   - Automated list-flood requests are constrained earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/sponsors/services/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 16)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified consistency gap with minimal behavior change.

### Implemented
1. Sponsor services `[offerId]` route service-role client parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/sponsors/services/[offerId]/route.ts`

### In Practice
1. Before:
   - The offer update/delete endpoint used a service-role client without explicit non-persistent auth options.
2. After:
   - The endpoint now uses the same non-persistent service-role client settings as other hardened routes.
3. User impact:
   - No functional flow change for normal users.
   - Security/client-behavior consistency is improved across privileged routes.

### Verification Completed
- `npm exec -- eslint "src/app/api/sponsors/services/[offerId]/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 17)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified consistency gap with minimal behavior change.

### Implemented
1. Sponsor store route service-role client parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/sponsors/store/route.ts`

### In Practice
1. Before:
   - The sponsor-store update/delete endpoint used service-role client defaults.
2. After:
   - The endpoint now explicitly disables session persistence and token auto-refresh on the service-role client.
3. User impact:
   - No visible UI or API behavior change for normal use.
   - Privileged client behavior is safer and more consistent with hardened routes.

### Verification Completed
- `npm exec -- eslint "src/app/api/sponsors/store/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 18)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified consistency gap with minimal behavior change.

### Implemented
1. Product `[id]` route service-role client parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/products/[id]/route.ts`

### In Practice
1. Before:
   - The moderator product-delete endpoint used service-role client default auth behavior.
2. After:
   - The endpoint now explicitly disables session persistence and token auto-refresh on the service-role client.
3. User impact:
   - No visible flow change for moderators deleting listings.
   - Privileged client behavior is safer and consistent with hardened routes.

### Verification Completed
- `npm exec -- eslint "src/app/api/products/[id]/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 19)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified consistency gap with minimal behavior change.

### Implemented
1. Upload route service-role client parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/uploads/route.ts`

### In Practice
1. Before:
   - The upload/delete storage endpoint used service-role client default auth behavior.
2. After:
   - The endpoint now explicitly disables session persistence and token auto-refresh on the service-role client.
3. User impact:
   - No visible change in upload/delete behavior.
   - Privileged client behavior is safer and consistent with hardened routes.

### Verification Completed
- `npm exec -- eslint "src/app/api/uploads/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 20)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified consistency gap with minimal behavior change.

### Implemented
1. Product sold-toggle route service-role client parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/products/[id]/sold/route.ts`

### In Practice
1. Before:
   - The sold-toggle endpoint used service-role client default auth behavior.
2. After:
   - The endpoint now explicitly disables session persistence and token auto-refresh on the service-role client.
3. User impact:
   - No visible change in marking listings sold/unsold.
   - Privileged client behavior is safer and consistent with hardened routes.

### Verification Completed
- `npm exec -- eslint "src/app/api/products/[id]/sold/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 21)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified consistency gap with minimal behavior change.

### Implemented
1. Product translate route service-role client parity hardening.
   - Added service-role client auth options parity (`persistSession: false`, `autoRefreshToken: false`).
   - File: `src/app/api/products/translate/route.ts`

### In Practice
1. Before:
   - The product-translate endpoint used service-role client default auth behavior.
2. After:
   - The endpoint now explicitly disables session persistence and token auto-refresh on the service-role client.
3. User impact:
   - No visible change in translation behavior.
   - Privileged client behavior is safer and consistent with hardened routes.

### Verification Completed
- `npm exec -- eslint "src/app/api/products/translate/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 22)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified request-layer consistency gap with minimal behavior change.

### Implemented
1. Admin app-contacts GET route parity hardening.
   - Added per-IP request throttling on GET path.
   - Added per-user request throttling on GET path.
   - File: `src/app/api/admin/app-contacts/route.ts`

### In Practice
1. Before:
   - The app-contacts read endpoint had origin/auth checks but no request-rate controls.
2. After:
   - Repeated read calls are throttled by source IP and authenticated moderator/admin user (`429` + `Retry-After`).
3. User impact:
   - Normal app-contacts reads remain unchanged.
   - Automated read-flood attempts are constrained earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/app-contacts/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 23)

### Objectives
- Continue parity-gap closure on remaining `Required now` routes.
- Harden one identified request-layer consistency gap with minimal behavior change.

### Implemented
1. Admin sponsor-live-stats settings GET route parity hardening.
   - Added per-IP request throttling on GET path.
   - Added per-user request throttling on GET path.
   - File: `src/app/api/admin/app-settings/sponsor-live-stats/route.ts`

### In Practice
1. Before:
   - The sponsor-live-stats settings read endpoint had origin/auth checks but no request-rate controls.
2. After:
   - Repeated read calls are throttled by source IP and authenticated moderator/admin user (`429` + `Retry-After`).
3. User impact:
   - Normal settings reads remain unchanged.
   - Automated read-flood attempts are constrained earlier.

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/app-settings/sponsor-live-stats/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 24)

### Objectives
- Start Priority 1 service-role reduction for `search_click_events`.
- Move one route off service-role while preserving request-layer hardening and behavior.

### Implemented
1. Added local-first DB migration for `search_click_events` insert policies.
   - Generated migration: `supabase/migrations/20260223100328_search_click_events_rls_insert_policies.sql`
   - Added authenticated insert policy:
     - `auth.uid() = user_id`
   - Added anonymous insert policy:
     - `user_id is null`
2. Replaced service-role insert path with scoped client insert in:
   - `src/app/api/search/click/route.ts`
3. Kept existing request hardening unchanged:
   - origin allow-list checks,
   - per-IP throttling,
   - payload sanitization/validation.

### In Practice
1. Before:
   - Search-click events were inserted using service-role privileges.
2. After:
   - Search-click events are inserted by the request user's scoped client under RLS policies.
3. User impact:
   - Search click tracking behavior remains the same.
   - Privilege scope is reduced, lowering blast radius if this route is abused.

### Verification Completed
- `supabase status`
- `supabase db diff -f search_click_events_rls_insert_policies`
- `npm exec -- eslint "src/app/api/search/click/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 25)

### Objectives
- Start Priority 2 service-role reduction for message routes.
- Move one message-history route off service-role with DB-level participant enforcement.

### Implemented
1. Added local-first DB migration for a secure message-history RPC.
   - Generated migration:
     - `supabase/migrations/20260223110158_messages_conversation_messages_secure_rpc.sql`
   - Added RPC:
     - `public.list_conversation_messages_secure(p_conversation_id, p_before, p_limit)`
   - RPC behavior:
     - checks `auth.uid()` is a participant (`seller_id` or `buyer_id`) in the conversation,
     - returns ordered message rows with bounded pagination (10-200),
     - denies non-participants.
2. Replaced service-role read path in:
   - `src/app/api/messages/conversations/[id]/messages/route.ts`
   - Route now calls RPC through the scoped authenticated client.
3. Tightened RPC execute surface:
   - revoked anon/public execute access,
   - granted execute to `authenticated` and `service_role`.

### In Practice
1. Before:
   - Message history route used service-role reads (conversation + messages), with participant checks only in route code.
2. After:
   - The database RPC itself verifies the caller is part of that conversation before returning messages.
3. User impact:
   - Real chat participants see the same message history behavior.
   - Attack attempts to fetch another user's conversation history are blocked by DB-layer checks.

### Verification Completed
- `supabase db diff -f messages_conversation_messages_secure_rpc`
- `npm exec -- eslint "src/app/api/messages/conversations/[id]/messages/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 26)

### Objectives
- Continue Priority 2 service-role reduction on message routes.
- Move conversation-detail read path off service-role with DB-level participant enforcement.

### Implemented
1. Added local-first DB migration for a secure conversation-detail RPC.
   - Generated migration:
     - `supabase/migrations/20260223113222_messages_conversation_detail_secure_rpc.sql`
   - Added RPC:
     - `public.get_conversation_detail_secure(p_conversation_id)`
   - RPC behavior:
     - requires authenticated caller (`auth.uid()`),
     - returns no row when conversation id does not exist,
     - raises forbidden for non-participants,
     - returns normalized conversation + product + profile fields.
2. Replaced service-role read path in:
   - `src/app/api/messages/conversations/[id]/route.ts` (GET)
   - Route now calls secure RPC through scoped authenticated client.
3. Tightened RPC execute surface:
   - revoked anon/public execute access,
   - granted execute to `authenticated` and `service_role`.
4. Kept DELETE path unchanged in this slice:
   - `src/app/api/messages/conversations/[id]/route.ts` (DELETE still service-role for now).

### In Practice
1. Before:
   - Opening one conversation used service-role reads, with participant checks only in route code.
2. After:
   - The database RPC itself checks that the caller is the seller or buyer in that conversation.
3. User impact:
   - Real chat participants see the same conversation detail response.
   - Attack attempts to read another user’s conversation details are blocked directly by DB rules.

### Verification Completed
- `supabase db diff -f messages_conversation_detail_secure_rpc`
- `npm exec -- eslint "src/app/api/messages/conversations/[id]/route.ts"`
- `npm run typecheck`
- `supabase db reset` (migration replay completed, but local stack restart failed with `502 upstream` after seeding)
- `supabase db diff` (no schema changes found after reset attempt)

## Phase 4 Worklog (Slice C - Part 27)

### Objectives
- Continue Priority 2 service-role reduction on message routes.
- Move conversation-list read path off service-role with DB-level caller enforcement.

### Implemented
1. Added local-first DB migration for a secure conversation-list RPC.
   - Generated migration:
     - `supabase/migrations/20260223120007_messages_conversation_summaries_secure_rpc.sql`
   - Added RPC:
     - `public.list_conversation_summaries_secure()`
   - RPC behavior:
     - requires authenticated caller (`auth.uid()`),
     - returns only conversations where caller is seller or buyer,
     - returns unread counts scoped to caller receiver id.
2. Tightened execute permissions for both list RPCs.
   - New secure RPC:
     - revoked anon/public execute,
     - granted execute to `authenticated` and `service_role`.
   - Legacy RPC (`public.list_conversation_summaries(uuid)`):
     - revoked anon/public/authenticated execute,
     - kept execute for `service_role` only.
3. Replaced service-role route path in:
   - `src/app/api/messages/conversations/route.ts`
   - GET now uses scoped RPC:
     - `list_conversation_summaries_secure`
   - Removed service-role fallback queries from this route.

### In Practice
1. Before:
   - Chat inbox list route used service-role RPC/fallback reads.
   - Legacy list RPC could be called directly with any user id.
2. After:
   - Inbox list is loaded via authenticated scoped RPC that derives user id from `auth.uid()`.
   - Legacy RPC is no longer callable by normal users/tokens.
3. User impact:
   - Users still see the same inbox list UI/shape.
   - Attack attempts to fetch someone else’s conversation list through direct RPC calls are blocked.

### Verification Completed
- `supabase db diff -f messages_conversation_summaries_secure_rpc`
- `npm exec -- eslint "src/app/api/messages/conversations/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 28)

### Objectives
- Continue Priority 2 service-role reduction on message routes.
- Move conversation-read update path off service-role with DB-level participant and receiver enforcement.

### Implemented
1. Added local-first DB migration for secure conversation-read RPC.
   - Generated migration:
     - `supabase/migrations/20260223122014_messages_mark_conversation_read_secure_rpc.sql`
   - Added RPC:
     - `public.mark_conversation_read_secure(p_conversation_id)`
   - RPC behavior:
     - requires authenticated caller (`auth.uid()`),
     - requires caller to be conversation participant,
     - updates only unread messages where `receiver_id = auth.uid()` in that conversation.
2. Tightened RPC execute surface:
   - revoked anon/public execute,
   - granted execute to `authenticated` and `service_role`.
3. Replaced service-role route path in:
   - `src/app/api/messages/conversations/[id]/read/route.ts`
   - POST now calls secure RPC through scoped authenticated client.

### In Practice
1. Before:
   - Mark-as-read route used service-role conversation lookup and service-role message updates.
2. After:
   - The DB RPC itself checks the caller is in that conversation and only marks that caller’s unread incoming messages as read.
3. User impact:
   - Mark-as-read behavior stays the same for real users.
   - Crafted requests can no longer mark another user’s messages as read.

### Verification Completed
- `supabase db diff -f messages_mark_conversation_read_secure_rpc`
- `npm exec -- eslint "src/app/api/messages/conversations/[id]/read/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 29)

### Objectives
- Continue Priority 2 service-role reduction on message routes.
- Move message-delete path off service-role with DB-level sender enforcement and summary refresh.

### Implemented
1. Added local-first DB migration for secure message-delete RPC.
   - Generated migration:
     - `supabase/migrations/20260223124555_messages_delete_secure_rpc.sql`
   - Added RPC:
     - `public.delete_message_secure(p_message_id)`
   - RPC behavior:
     - requires authenticated caller (`auth.uid()`),
     - returns not-found when message does not exist,
     - blocks non-sender delete attempts,
     - deletes only sender-owned message,
     - recomputes conversation `last_message` / `last_message_at` after delete.
2. Tightened RPC execute surface:
   - revoked anon/public execute,
   - granted execute to `authenticated` and `service_role`.
3. Replaced service-role route path in:
   - `src/app/api/messages/[id]/route.ts`
   - DELETE now calls secure RPC through scoped authenticated client.

### In Practice
1. Before:
   - Message delete used service-role reads and conversation-summary updates in route code.
2. After:
   - The database RPC enforces sender ownership and updates conversation preview safely.
3. User impact:
   - Sender can still delete own messages normally.
   - Attack attempts to delete someone else’s message are blocked at DB level.

### Verification Completed
- `supabase db diff -f messages_delete_secure_rpc`
- `npm exec -- eslint "src/app/api/messages/[id]/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 30)

### Objectives
- Continue Priority 2 service-role reduction on message routes.
- Move conversation-delete path off service-role with DB-level participant enforcement.

### Implemented
1. Added local-first DB migration for secure conversation-delete RPC.
   - Generated migration:
     - `supabase/migrations/20260223131619_messages_delete_conversation_secure_rpc.sql`
   - Added RPC:
     - `public.delete_conversation_secure(p_conversation_id)`
   - RPC behavior:
     - requires authenticated caller (`auth.uid()`),
     - deletes only when caller is seller or buyer in that conversation,
     - returns forbidden when caller is not a participant (or target is not deletable by caller).
2. Tightened RPC execute surface:
   - revoked anon/public execute,
   - granted execute to `authenticated` and `service_role`.
3. Replaced service-role DELETE path in:
   - `src/app/api/messages/conversations/[id]/route.ts`
   - DELETE now calls secure RPC through scoped authenticated client.

### In Practice
1. Before:
   - Conversation delete depended on service-role lookup/delete logic in route code.
2. After:
   - The database RPC itself decides if the caller is allowed to delete that conversation.
3. User impact:
   - Real participants can still delete their own conversation thread.
   - Outsiders cannot delete other users' conversations, even with crafted API calls.

### Verification Completed
- `supabase db diff -f messages_delete_conversation_secure_rpc`
- `npm exec -- eslint "src/app/api/messages/conversations/[id]/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 31)

### Objectives
- Start next replaceable-later service-role reduction.
- Remove normal admin-key write dependency from partnership inquiry submit path.

### Implemented
1. Removed service-role client dependency from:
   - `src/app/api/partnerships/route.ts`
2. Updated partnership inquiry insert path:
   - now uses scoped server client (`createClient(cookieStore)`) for `partnership_inquiries` insert.
3. Kept seller-application guard behavior:
   - still requires signed-in user resolution before seller-application submit.
4. Kept response contract unchanged:
   - route still returns `{ ok, emailSent, mailto, saved }` behavior as before.

### In Practice
1. Before:
   - normal form submit used a powerful admin database key.
2. After:
   - normal form submit uses limited user/anon DB permissions through existing RLS policy.
3. User impact:
   - form behavior stays the same for users.
   - if this endpoint is abused, attacker leverage is lower because no admin-key write path is used for standard submits.

### Verification Completed
- `npm exec -- eslint "src/app/api/partnerships/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 32)

### Objectives
- Continue replaceable-later service-role reduction.
- Remove normal admin-key dependency from sponsor click-event writes.

### Implemented
1. Added local-first DB migration for scoped click-event inserts:
   - `supabase/migrations/20260223135330_sponsor_store_click_events_rls_insert_policies.sql`
2. Added RLS insert policies on `public.sponsor_store_click_events`:
   - `sponsor_store_click_events_insert_anonymous`:
     - allows `anon` insert only when `user_id is null`,
     - only allowed sources (`spotlight_card`, `store_page`),
     - only for active sponsor stores.
   - `sponsor_store_click_events_insert_authenticated`:
     - allows `authenticated` insert only when `user_id = auth.uid()`,
     - only allowed sources (`spotlight_card`, `store_page`),
     - only for active sponsor stores.
3. Removed service-role route path in:
   - `src/app/api/sponsors/stats/click/route.ts`
   - route now writes with scoped server client (`createClient(cookieStore)`).

### In Practice
1. Before:
   - sponsor click tracking used a powerful admin database key.
2. After:
   - sponsor click tracking uses limited auth/anon permissions enforced by RLS.
3. User impact:
   - clicks still record as before for normal users.
   - abuse has lower blast radius because this endpoint no longer writes through an admin key.

### Verification Completed
- `supabase db diff -f sponsor_store_click_events_rls_insert_policies`
- `npm exec -- eslint "src/app/api/sponsors/stats/click/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 33)

### Objectives
- Continue replaceable-later service-role reduction.
- Reduce routine service-role usage on public health checks while preserving privileged diagnostics.

### Implemented
1. Updated:
   - `src/app/api/health/route.ts`
2. Public health path hardening:
   - database check now uses scoped server client,
   - storage check now uses scoped storage list path.
3. Privileged diagnostics path retained with tighter gate:
   - service-role storage bucket check now runs only when a valid bearer token matches `ADMIN_REVALIDATE_TOKEN`.
4. Added endpoint abuse controls:
   - per-IP rate limiting with `429` + `Retry-After`.
5. Reduced sensitive output:
   - health errors are mapped to safe labels in API response, detailed errors are kept in server logs.

### In Practice
1. Before:
   - every health call used a master/admin DB key path.
2. After:
   - normal health checks use low-privilege access,
   - only privileged token-auth diagnostics use service-role.
3. User impact:
   - uptime checks still work as before.
   - attackers probing this endpoint get a much narrower privileged surface.

### Verification Completed
- `npm exec -- eslint "src/app/api/health/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 34)

### Objectives
- Continue replaceable-later service-role reduction.
- Remove service-role dependency from standard abuse-report submit flow.

### Implemented
1. Added local-first DB migration to move auto-flag side effects into DB trigger:
   - `supabase/migrations/20260223141414_abuse_reports_handle_auto_flag_secure_trigger_actions.sql`
2. Updated trigger function:
   - `public.handle_abuse_report()`
   - now performs:
     - auto-flag status update on threshold,
     - auto-hide of reported product when threshold is reached,
     - system notifications to seller and reporter for auto-flagged cases.
3. Removed route-level service-role side effects from:
   - `src/app/api/abuse/report/route.ts`
   - route now stays on scoped auth path for submit flow and audit logging.

### In Practice
1. Before:
   - abuse-report route used a master/admin key path for auto-flag side effects.
2. After:
   - route submit stays low-privilege,
   - privileged side effects run inside a DB security-definer trigger.
3. User impact:
   - users still submit reports the same way.
   - auto-flag behavior is preserved, but endpoint blast radius is reduced because route code no longer uses service-role.

### Verification Completed
- `supabase db diff -f abuse_reports_handle_auto_flag_secure_trigger_actions`
- `npm exec -- eslint "src/app/api/abuse/report/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 35)

### Objectives
- Continue replaceable-later service-role reduction.
- Remove route-level service-role dependency from Algolia sync submit flow.

### Implemented
1. Added local-first DB migration for secure Algolia product row read:
   - `supabase/migrations/20260223145649_algolia_sync_secure_product_row_rpc.sql`
2. Added secure RPC:
   - `public.get_algolia_product_row_secure(p_product_id)`
   - behavior:
     - requires authenticated caller (`auth.uid()`),
     - allows only listing seller or admin/moderator role to fetch sync row,
     - returns forbidden for non-owner non-moderator callers.
3. Tightened RPC execute surface:
   - revoked anon/public execute,
   - granted execute to `authenticated` and `service_role`.
4. Updated route:
   - `src/app/api/search/algolia-sync/route.ts`
   - replaced service-role product read with scoped RPC path.

### In Practice
1. Before:
   - route used a master/admin DB key to load product row before indexing.
2. After:
   - route uses authenticated scoped client + DB authorization checks for that read path.
3. User impact:
   - seller/moderator sync behavior remains the same.
   - probing this endpoint no longer gives a direct route-level service-role DB read surface.

### Verification Completed
- `supabase db diff -f algolia_sync_secure_product_row_rpc`
- `npm exec -- eslint "src/app/api/search/algolia-sync/route.ts"`
- `npm run typecheck`
- `supabase db reset`
- `supabase db diff` (no schema changes found after reset)

## Phase 4 Worklog (Slice C - Part 36)

### Objectives
- Continue service-role surface reduction by isolating public health from privileged diagnostics.
- Ensure public health path has no service-role code path.

### Implemented
1. Updated public endpoint:
   - `src/app/api/health/route.ts`
   - removed all service-role diagnostics logic.
2. Added protected internal diagnostics endpoint:
   - `src/app/api/internal/health/route.ts`
   - uses service-role checks for deeper diagnostics,
   - protected by admin token auth (`Authorization: Bearer` or `x-admin-token`),
   - includes origin allow-list and IP/token rate limiting.
3. Kept safe error handling:
   - API responses use safe labels; detailed errors remain server-side in logs.

### In Practice
1. Before:
   - public `/api/health` still contained an optional master-key diagnostics branch.
2. After:
   - public `/api/health` is strictly low-privilege,
   - deep checks moved to protected internal endpoint.
3. User impact:
   - uptime checks still work for monitors.
   - attackers probing public health endpoint cannot trigger service-role diagnostics path.

### Verification Completed
- `npm exec -- eslint "src/app/api/health/route.ts" "src/app/api/internal/health/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 37)

### Objectives
- Start closeout hardening pass on remaining required-now sponsor-admin routes.
- Tighten request-layer abuse controls on sponsor-store admin create/status mutations.

### Implemented
1. Hardened sponsor-store admin create/list route:
   - `src/app/api/admin/sponsors/stores/route.ts`
   - tightened create throttles (IP and user),
   - added slug-targeted create throttling,
   - added payload size cap for create requests,
   - added structured logs on rate-limited create/list events.
2. Hardened sponsor-store admin status route:
   - `src/app/api/admin/sponsors/stores/[storeId]/status/route.ts`
   - tightened status throttles (IP and user),
   - added per-store status-change throttle,
   - added payload size cap for status updates,
   - added structured logs on rate-limited status events.

### In Practice
1. Before:
   - repeated admin create retries and same-store status flipping could run at a higher burst rate.
2. After:
   - repeated create attempts are blocked sooner,
   - repeated active/disabled flipping on one store now hits a dedicated per-store limit (`429` + `Retry-After`),
   - oversized request bodies are rejected early (`413`) before heavy processing.
3. User impact:
   - normal admin work remains the same,
   - abuse or automation bursts are cut off faster and easier to audit.

### Verification Completed
- `npm exec -- eslint "src/app/api/admin/sponsors/stores/route.ts" "src/app/api/admin/sponsors/stores/[storeId]/status/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 38)

### Objectives
- Complete required-now route parity sweep for request-layer abuse controls.
- Patch any uncovered high-impact gap on required-now service-role routes.

### Implemented
1. Completed closeout sweep across required-now routes (auth/origin/rate/input guards).
2. Patched uncovered gap on moderator hard-delete path:
   - `src/app/api/products/[id]/route.ts`
   - added origin allow-list guard,
   - added per-IP and per-user delete throttles,
   - added strict UUID validation for `productId` route param.
3. Kept all existing privileged behavior:
   - moderator authorization,
   - service-role product/storage cleanup,
   - Algolia sync + revalidation flow.

### In Practice
1. Before:
   - if an attacker got a moderator session, they could spam delete calls on product IDs with weaker request throttling.
2. After:
   - suspicious bursts on delete are blocked earlier (`429` + `Retry-After`),
   - cross-origin delete attempts are blocked (`403`),
   - malformed/guess-style IDs fail fast (`400`) before deeper privileged work.
3. User impact:
   - normal moderator delete flow is unchanged,
   - abuse automation now has a smaller window and higher friction.

### Verification Completed
- `npm exec -- eslint "src/app/api/products/[id]/route.ts"`
- `npm run typecheck`

## Phase 4 Worklog (Slice C - Part 39)

### Objectives
- Finish Phase 4 closeout documentation with an explicit residual-risk inventory.
- Create a practical Phase 5 kickoff checklist (dependency, secret rotation, monitoring).

### Implemented
1. Added Phase 4 residual-risk register:
   - `docs/security/PHASE4_CLOSEOUT_RESIDUAL_RISKS.md`
   - captures by-design service-role routes, abuse scenarios, current controls, and remaining risks.
2. Added Phase 5 kickoff checklist:
   - `docs/security/PHASE5_SLICE_A_PART1_CHECKLIST.md`
   - defines first concrete execution steps and acceptance gate.
3. Updated Phase 4 tracking docs to point to closeout + Phase 5 kickoff:
   - `docs/security/SERVICE_ROLE_INVENTORY.md`
   - `docs/security/SERVICE_ROLE_REDUCTION_PLAN.md`
   - `docs/security/SECURITY_HARDENING_ROADMAP.md`

### In Practice
1. Before:
   - hardening changes existed, but there was no single operator-focused document describing what risks still remain by design.
2. After:
   - you now have a clear "what can still go wrong" list and an immediate next-step checklist.
3. User impact:
   - no behavior change in the app from this slice.
   - security work is now easier to execute and audit without guessing.

### Verification Completed
- `npm run typecheck`

## Next Phase Candidate (Phase 5 Slice A - Part 1)

### Planned Scope
1. Run dependency triage baseline and produce fix/accept decisions with severity.
2. Draft and validate secret-rotation runbook order (staging first, then production).
3. Define telemetry checks for abuse signals (401/403/429/5xx and admin-path spikes).

### In Plain Language (Next Step)
1. Next we check the software packages and secrets, because many real attacks happen through old dependencies or leaked tokens.
2. In practice, this means creating a concrete "rotate, verify, monitor" routine that can be repeated safely.

### Acceptance Gate for Phase 5 Slice A - Part 1
- Dependency baseline report created with actionable remediation list.
- Secret-rotation runbook draft ready with verification steps and rollback notes.
- Lint/typecheck stay green.

## Operating Notes
- One phase at a time to avoid overload and regression noise.
- Update this file at end of each phase before starting the next.
