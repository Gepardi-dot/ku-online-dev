# KU BAZAR Production Readiness

Last updated: 2026-06-18

## Current Status

KU BAZAR should still be treated as a production-capable beta until abuse resistance, operational access, deployment discipline, and real-traffic performance are consistently proven.

The current hardening focus is to preserve the intended C2C marketplace behavior while improving production confidence. Intentional product decisions remain in place: public product browsing for signed-out users, contact/actions gated by sign-in, no marketplace payments for now, and automatic product lifecycle cleanup after roughly three months.

## Latest Candidate

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

Known notes:
- Local homepage smoke still shows two 400s for local Supabase product image resources. This appears tied to local storage/test data, not the optimized static asset changes.
- Candidate E does not change DB schema, RLS, storage buckets, auth providers, PWA rollout flags, or SLO thresholds.

## Active Production Risks

- Real-user performance needs continued governance through production SLO checks after deploy.
- C2C abuse workflows still need continuous hardening: reporting, blocking, moderation queues, repeat-offender detection, and auditability.
- Server-side service-role paths should continue to receive ownership checks, tests, and audit logging.
- Local and production environment parity should be checked before DB, auth, provider, storage, or deploy mutations.
