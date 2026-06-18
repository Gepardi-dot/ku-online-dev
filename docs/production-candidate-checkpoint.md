# Production Candidate Checkpoint

Last updated: 2026-06-18

## Candidate E

Branch: `candidate/e-homepage-sell-performance`

Goal: reduce first-paint risk on `/` and `/sell` without changing marketplace behavior, auth, DB schema, PWA rollout, or production thresholds.

Important files changed:
- `src/components/brand-logo.tsx`
- `src/data/category-ui-config.ts`
- `src/app/page.tsx`
- `src/app/sell/page.tsx`
- `src/app/sell/sell-form.tsx`
- `public/optimized/**`

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none

Validation performed:
- `npm exec eslint -- src/app/page.tsx src/app/sell/page.tsx src/app/sell/sell-form.tsx src/components/brand-logo.tsx src/data/category-ui-config.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Local production server health check on `http://127.0.0.1:5010/api/health`
- Playwright timing/resource smoke for `/` and `/sell`
- Visual screenshot spot-check for `/` and `/sell`

Observed timing smoke:
- `/`: status 200, FCP about 1732ms, optimized logo and category WebP assets used.
- `/sell`: status 200, FCP about 536ms, no normal-path client categories request observed.

Risks and rollout notes:
- Local homepage test data produced two product-image 400s from local Supabase storage. Verify production product images after deploy.
- Production SLO governance should be rerun after deployment and real-user exposure.
- Rollback is a normal git revert of Candidate E; no database rollback is required.
