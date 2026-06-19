# KU BAZAR Production Readiness

Last updated: 2026-06-19

## Current Status

KU BAZAR should still be treated as a production-capable beta until abuse resistance, operational access, deployment discipline, and real-traffic performance are consistently proven.

The current hardening focus is to preserve the intended C2C marketplace behavior while improving production confidence. Intentional product decisions remain in place: public product browsing for signed-out users, contact/actions gated by sign-in, no marketplace payments for now, and automatic product lifecycle cleanup after roughly three months.

## Latest Candidate

Candidate G: durable rate-limit backend preparation.

Changes:
- Added a shared fixed-window rate-limit backend with optional Upstash Redis REST enforcement.
- Migrated existing API rate-limit call sites to await the shared async limiter while preserving current response shapes and retry headers.
- Kept in-memory fallback for local development and for production fail-open behavior if Redis is unavailable.
- Added focused unit tests for memory enforcement, Upstash REST command behavior, fallback behavior, and safe key normalization.
- Normalized optional environment values so empty optional provider strings are treated as absent instead of breaking production build collection.

Validation:
- `npm run typecheck`: pass
- `npm test`: pass
- `npm run lint`: pass
- `npm run build`: pass with Vercel production env loaded through a temp file
- `npm run check:env`: pass with Vercel production env loaded through a temp file

Known notes:
- No Supabase schema, table, bucket, RLS, storage, or auth-provider changes were made.
- Production will continue using the in-memory fallback until `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured in Vercel.
- If Upstash is configured but unavailable, the app logs a server warning and falls back to in-memory throttling to avoid taking down legitimate user flows.

## Previous Candidate

Candidate E: homepage and sell-page first-paint hardening.

Changes:
- Optimized brand/category image assets added under `public/optimized/`.
- Header logo now uses `next/image` and the optimized logo asset.
- Homepage category icons prefer optimized known-category assets over DB icon paths.
- Homepage category/filter controls and product grid now render under separate Suspense boundaries.
- `/sell` receives server-provided active non-sponsor categories, with client fetch retained as fallback only.

Validation:
- `npm exec eslint -- changed files`: pass
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run build`: pass with command-scoped local env and placeholder `ADMIN_REVALIDATE_TOKEN`
- Local production health on `127.0.0.1:5010`: pass
- Playwright timing smoke: `/` FCP about 1732ms, `/sell` FCP about 536ms
- GitHub CI for commit `42e436f`: pass
- Vercel production deployment `dpl_7WHHzv7L6B3cp8u3tzRDqYKjcAgM`: ready
- Production HTTP and Playwright smoke for `/`, `/sell`, and `/api/health`: pass
- PWA incident rehearsal: pass
- Strict PWA governance: fail due poor-vitals rate 25.00% over the 15.00% gate

Known notes:
- Local homepage smoke still shows two 400s for local Supabase product image resources. This appears tied to local storage/test data, not the optimized static asset changes.
- Candidate E does not change DB schema, RLS, storage buckets, auth providers, PWA rollout flags, or SLO thresholds.
- Read-only production telemetry for the failing 60-minute window showed one `/` FCP poor sample at 3740ms and one `/` LCP needs-improvement sample at 3792ms, with TTFB good at 68.2ms. This means the release improved synthetic smoke behavior, but the strict real-user launch gate still needs more burn-in data or another homepage render/resource optimization pass.
- 2026-06-19 burn-in check: the poor homepage sample aged out. Scheduled PWA Ramp Governance passed on `6ccde1e`; manual normal governance is WARN because there were zero recent events, not because poor vitals remain. Manual strict `--fail-on-warn true` still fails on missing-rate warnings when event volume is zero.

## Active Production Risks

- Real-user homepage performance needs more evidence: the previous poor-vitals sample aged out, but the latest manual window had zero events, so there is not enough fresh real-user telemetry to claim the homepage is fully cleared.
- Distributed rate limiting is now code-ready but not production-active until Upstash Redis REST env vars are configured and deployed.
- C2C abuse workflows still need continuous hardening: reporting, blocking, moderation queues, repeat-offender detection, and auditability.
- Server-side service-role paths should continue to receive ownership checks, tests, and audit logging.
- Local and production environment parity should be checked before DB, auth, provider, storage, or deploy mutations.
