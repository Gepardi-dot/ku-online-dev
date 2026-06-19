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
- GitHub CI on `main` for commit `42e436f`: pass
- Vercel production deployment `dpl_7WHHzv7L6B3cp8u3tzRDqYKjcAgM`: ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Production HTTP smoke for `/api/health`, `/`, and `/sell`: pass
- Production Playwright smoke for `/` and `/sell`: pass, with no console errors or page errors
- PWA incident rehearsal: pass

Observed timing smoke:
- `/`: status 200, FCP about 1732ms, optimized logo and category WebP assets used.
- `/sell`: status 200, FCP about 536ms, no normal-path client categories request observed.
- Production `/`: status 200, FCP about 1096ms in synthetic browser smoke, optimized logo and category WebP assets used.
- Production `/sell`: status 200, FCP about 784ms in synthetic browser smoke, no normal-path client categories request observed.

Risks and rollout notes:
- Local homepage test data produced two product-image 400s from local Supabase storage. Verify production product images after deploy.
- Production strict PWA governance failed after deploy because poor vitals rate was 25.00% over the 15.00% gate. Read-only aggregate telemetry showed one `/` FCP poor sample at 3740ms, one `/` LCP needs-improvement sample at 3792ms, and TTFB good at 68.2ms. Summary status remained pass because sample volume is below the 30-sample SLO threshold, but the strict launch gate is not green.
- Rollback is a normal git revert of Candidate E; no database rollback is required.

## Candidate F Burn-In Check

Date: 2026-06-19

Goal: re-check Candidate E after the previous poor homepage sample aged out of the 60-minute PWA governance window.

Current production evidence:
- Latest deployed commit remains `6ccde1e`.
- Latest production deployment remains ready and serving `www.kubazar.net`.
- Live HTTP smoke for `/api/health`, `/`, and `/sell`: pass.
- Scheduled GitHub workflows on `6ccde1e`: PWA Ramp Governance pass, PWA SLO Alerts pass, Cleanup expired listings pass, Product translations & embeddings pass.
- Manual PWA incident rehearsal: pass.
- Manual normal PWA ramp governance: warn, not fail. There were zero events in the last 60 minutes, so poor-vitals and service-worker failure rates were unavailable.
- Manual strict `--fail-on-warn true` governance: fail only because missing-rate warnings are treated as failures; no active alerts and no current poor-vitals samples were present.

Production interpretation:
- The immediate bad `/` FCP sample from Candidate E is no longer active in the 60-minute window.
- This is better than the previous red poor-vitals gate, but it is not a full performance proof because there was no recent real-user sample volume.
- Next launch-readiness step is to collect enough real-user telemetry or continue homepage optimization if future samples regress.
