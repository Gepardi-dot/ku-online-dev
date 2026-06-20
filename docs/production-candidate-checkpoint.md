# Production Candidate Checkpoint

Last updated: 2026-06-20

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

## Candidate G Durable Rate-Limit Backend

Date: 2026-06-19

Goal: replace process-local API rate-limit storage with a production-capable backend path while preserving existing C2C marketplace behavior.

Important files changed:
- `src/lib/security/rate-limit-store.ts`
- `src/lib/security/request.ts`
- `src/lib/rate-limit.ts`
- `src/app/api/**/route.ts` rate-limit call sites
- `src/lib/security/__tests__/rate-limit-store.test.ts`
- `src/lib/env.ts`
- `scripts/check-env.mjs`
- `tools/test-stubs/*`
- `tsconfig.test.json`

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none

Validation performed:
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build` with Vercel production env loaded through a temp file
- `npm run check:env` with Vercel production env loaded through a temp file
- GitHub CI run `27822555115` on commit `5736b21`: pass
- Vercel production deployment `dpl_2ZHSbR5dzBJCYAeuF6Tjh2CggrgU`: ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Live HTTP smoke for `/api/health`, `/`, and `/sell`: pass

Production interpretation:
- The code now supports distributed fixed-window rate limiting through Upstash Redis REST using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- Without those Vercel env vars, production intentionally falls back to the prior in-memory behavior.
- A read-only Vercel env name check after deployment found no `UPSTASH`/`REDIS` env vars, so distributed Redis enforcement is not active yet.
- If Upstash is configured but unavailable, the app fails open to in-memory limits and logs a server warning rather than breaking user flows.

Risks and rollout notes:
- This is a broad API-surface change because existing rate-limit calls are now async, but return shapes and route response behavior were preserved.
- Actual distributed abuse resistance is not improved until the Upstash env vars are configured and redeployed.
- Rollback is a normal git revert of Candidate G; no database rollback is required.

## Candidate H Rate-Limit Provider Rollout

Date: 2026-06-20

Goal: activate the durable rate-limit backend in production and prove the live app is using Upstash-backed counters rather than process-local memory.

Important files changed:
- `src/lib/security/rate-limit-store.ts`
- `src/lib/security/__tests__/rate-limit-store.test.ts`
- `src/app/api/internal/health/route.ts`
- `src/lib/env.ts`
- `scripts/check-env.mjs`

Provider impact:
- Vercel project touched: `ku-online-dev`
- Upstash resource added: `ku-bazar-rate-limit`
- Resource settings: free plan, `iad1`, production environment only, `eviction=true`, `prodPack=false`, `autoUpgrade=false`

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none

Validation performed:
- Deploy MCP gate: `npm run mcp:auto -- --task deploy --doctor-only --keep-profile`
- `vercel integration add upstash/upstash-kv --name ku-bazar-rate-limit --plan free -m primaryRegion=iad1 -m eviction=true -m prodPack=false -m autoUpgrade=false -e production --no-env-pull --scope ku-onlines-projects`
- `vercel integration list ku-online-dev --scope ku-onlines-projects`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build` with Vercel production env loaded through a temp file
- `npm run check:env` with Vercel production env loaded through a temp file
- GitHub CI run `27873231575` on commit `e58b60f`: pass
- Vercel production deployment `dpl_EH2x1nXMub1jvh2PV97oDUJ7ExaQ`: ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Protected production health check: HTTP 200, `database=ok`, `storage=ok`, `rateLimit.status=ok`, `rateLimit.configured=true`, `rateLimit.source=vercel-kv`, `rateLimit.backend=upstash`
- Live HTTP smoke for `/api/health`, `/`, and `/sell`: pass

Production interpretation:
- The live production app is now using Upstash-backed durable counters through Vercel KV integration env vars.
- The code still supports explicit `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, but the Vercel marketplace integration currently provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- If Redis is temporarily unavailable, the limiter fails open to in-memory throttling and logs a warning instead of blocking legitimate marketplace flows.

Risks and rollout notes:
- Upstash free plan is acceptable for controlled beta hardening, but not the final broad-launch posture if traffic grows.
- Eviction is enabled on the current resource, which is acceptable for rate-limit counters but should not be reused for durable product, user, payment, or moderation state.
- One wrong-project Vercel deploy attempt happened from the candidate worktree during setup. It failed before affecting `ku-online-dev`; the local `.vercel` link was removed, and the correct linked project was used for the production redeploy.
- Rollback is to disconnect/remove the Upstash integration or unset the KV/Upstash env vars, then redeploy. The application will fall back to in-memory rate limiting. No database rollback is required.
