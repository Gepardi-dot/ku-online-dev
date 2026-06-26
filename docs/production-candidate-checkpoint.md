# Production Candidate Checkpoint

Last updated: 2026-06-26

## Candidate P1 Algolia Product-Row RPC Repair

Date: 2026-06-25 through 2026-06-26

Goal: repair the production Algolia sync `500` found during authenticated listing smoke, complete the provider rollout needed for public title search, and clean up the search runtime follow-ups found by the signed-in smoke.

Important files changed:
- `supabase/migrations/20260625104000_fix_algolia_product_row_secure.sql`
- `.github/workflows/algolia-provider-rollout.yml`
- `.github/workflows/algolia-production-smoke.yml`
- `tools/scripts/algolia-search-key.mjs`
- `tools/scripts/__tests__/algolia-search-key.test.mjs`
- `tools/scripts/algolia-production-smoke.mjs`
- `tools/scripts/__tests__/algolia-production-smoke.test.mjs`
- `tools/scripts/supabase-rpc-readiness.mjs`
- `tools/scripts/__tests__/supabase-rpc-readiness.test.mjs`
- `src/lib/services/products.ts`
- `src/lib/services/__tests__/searchProducts.test.ts`
- `tools/test-stubs/alias-loader.mjs`
- `tools/test-stubs/algoliasearch.js`

Supabase impact:
- Tables touched by schema/policy work: `search_click_events`.
- Buckets touched: none.
- RLS/policies touched: added `search_click_events_insert_anonymous` and `search_click_events_insert_authenticated` in production.
- Function replaced: `public.get_algolia_product_row_secure(uuid)`.
- Migrations added: `20260625104000_fix_algolia_product_row_secure.sql`.
- Existing migration applied to production: `20260223100328_search_click_events_rls_insert_policies.sql`.
- Provider rollout prepared: manual-only workflow can sync Vercel production Algolia env, redeploy, and backfill after explicit dispatch approval. It can use a pre-provided `ALGOLIA_SEARCH_API_KEY` GitHub secret or create/reuse a restricted key when the Algolia key has API-key-management permission.
- Production smoke tooling added: manual-only workflow creates one temporary production listing, indexes it, verifies direct Algolia search and public `/api/products/search`, then removes both the Algolia object and DB row.
- Signed-in production smoke touched `products`, `product-images`, Algolia sync, public product search, and owner deletion through the real production UI. No RLS, policy, bucket, or migration files were changed by this P1c validation slice.

Validation performed:
- Root cause confirmed: production `public.get_algolia_product_row_secure(uuid)` used dynamic SQL with an inner `select ... into v_seller_id, v_row`, which Postgres parsed as invalid SQL and returned `42601`.
- `node --check tools/scripts/supabase-rpc-readiness.mjs`: pass.
- `node --test tools/scripts/__tests__/supabase-rpc-readiness.test.mjs`: pass.
- Production readiness before apply failed as expected on missing migration `20260625104000` and the broken Algolia RPC body.
- Staging apply to `cuotmvhhgakjeqdsfziu`: pass; staging readiness passed with required migrations `3/3` and Algolia RPC body `ok`.
- Production apply to `kvmbtbhlapjlhfppomsw`: pass; production readiness passed with required migrations `3/3` and Algolia RPC body `ok`.
- `npm test`, `npm run lint`, `npm run typecheck`: pass.
- `npm run build`: pass with temporary Vercel production env loaded; the temp env file was deleted.
- Signed-in production smoke created temporary listing `571fdb0a-daab-4f4c-a952-03636a5c7fc1`; product insert returned `201`, `/api/search/algolia-sync` returned HTTP `200`, Vercel `500` log scan returned no records, owner deletion succeeded, and read-only production DB cleanup returned `matching_smoke_rows: 0`.
- Prepared workflow validation for `tools/scripts/algolia-search-key.mjs`: `node --check`, focused `node --test`, `npm test`, `npm run lint`, and `npm run typecheck` passed.
- Manual provider rollout workflow dispatch `28197874539`: failed before provider mutation at the search-key resolution step. Algolia returned `403 Invalid Application-ID or API key` for key list/create, so Vercel env, Vercel deployment, and Algolia index were not changed.
- Manual provider rollout workflow dispatch `28198477569`: passed search-key resolution with the provided secret but failed before Vercel env sync because the GitHub `VERCEL_TOKEN` could not access the forced Vercel scope. Vercel env, Vercel deployment, and Algolia index were not changed.
- Manual provider rollout workflow dispatch `28198606392`: passed search-key resolution but failed before Vercel env sync because GitHub secret `VERCEL_TOKEN` is invalid. Vercel env, Vercel deployment, and Algolia index were not changed.
- Manual provider rollout workflow dispatch `28200601751`: failed at the new Vercel value-length verification because Vercel sensitive production env values pull as empty; no redeploy or backfill was run.
- Manual provider rollout workflow dispatch `28200724605`: passed. Vercel Algolia env names were present after sync, production redeployed, and backfill logged `Indexed 17` plus `Algolia indexing complete`.
- Production smoke helper validation: `node --check tools/scripts/algolia-production-smoke.mjs`, `node --test tools/scripts/__tests__/algolia-production-smoke.test.mjs`, `npm test`, `npm run lint`, and `npm run typecheck` passed.
- GitHub CI run `28201304955` for commit `fdb265d`: passed.
- Manual Algolia production smoke workflow dispatch `28201312665`: passed. It created temporary product `fdea28c2-91bf-42b2-a9f4-508e091fbdeb`, indexed it, direct Algolia search returned `nbHits=1`, public `/api/products/search` returned `count=1` / `items=1`, and both Algolia plus DB cleanup passed.
- Public production health after rollout and smoke returned `200`.
- Signed-in production smoke on 2026-06-26: passed for create-to-search sync. Temporary listing `34c8165d-2bef-4441-8ec3-a51f3faa0786` was created through `/sell` with an image, product insert returned `201`, `/api/search/algolia-sync` returned `200` with `{"ok":true}`, title search found the listing, owner delete returned `200`, public `/api/products/search` cleanup returned `count: 0`, read-only production DB cleanup returned `matching_smoke_rows: 0`, and active browser console after cleanup reported `0` errors / `0` warnings.
- Vercel production log scan on 2026-06-26 found no recurrence of the previous `/api/search/algolia-sync` Supabase `42601` crash in the checked window. It did surface separate follow-ups: Supabase Edge Function `product-search` returned `500` while the app returned fallback `200`, and `/api/search/click` returned `500` because `search_click_events` insert hit RLS `42501`.
- P1d local validation: `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` passed. The build used a temporary Vercel production env file, which was deleted; the first build without local env failed as expected because required env vars were absent.
- Production DB gate for the RLS apply passed after Docker Desktop was started and local Supabase status values were exported only for the command process.
- Production RLS apply passed: `20260223100328_search_click_events_rls_insert_policies.sql` was applied to `kvmbtbhlapjlhfppomsw` with `--record-migration`.
- Production read-only verification confirmed both `search_click_events` insert policies and migration `20260223100328` are present.
- Runtime `/api/search/click` smoke returned `{"ok":true}` against an existing active product, and the checked Vercel error-log window had no error records after the smoke.

Production result:
- The production DB/RPC crash is fixed; `/api/search/algolia-sync` no longer returns the previous Supabase `42601` `500`.
- Provider/runtime search is now proven for controlled public title search: Vercel Algolia env names are configured, production was redeployed, the index was backfilled, and a temporary listing was found through public `/api/products/search` before cleanup.
- Signed-in create-flow search is now proven: the real `/sell` flow reached Algolia sync with `ok:true`, the listing was searchable by title, and cleanup removed it from both public search and the production DB.
- The app search path no longer invokes the stale Supabase `product-search` Edge Function when Algolia returns a valid empty result; if Algolia is unavailable, it falls back to the app's existing Supabase product query.
- Search click telemetry RLS is repaired in production for anonymous and authenticated insert paths.

Risks and rollout notes:
- Search indexing consistency is no longer blocked by the Algolia provider rollout or signed-in sync path, based on the 2026-06-26 smoke.
- Vercel sensitive production env values cannot be verified by `vercel env pull`; runtime smoke is the authoritative value check.
- The provider rollout workflow uses existing GitHub secrets for app/admin/index values and either uses `ALGOLIA_SEARCH_API_KEY` if provided or creates/reuses a restricted search-only key scoped to the base product index and current replica indices. It does not print the key.
- The stale Supabase `product-search` Edge Function remains deployed but should be treated as unused by the app search path after P1d deploy. Do not reintroduce it into the hot path without updating/deploying the function and adding runtime smoke coverage.
- Rental listing creation remains a separate blocker from Candidate P0 smoke.

## Candidate P0 Authenticated Production Smoke

Date: 2026-06-25

Goal: prove the P0 Supabase repair in a real signed-in production browser session and identify any remaining production blockers in the listing flow.

Important systems checked:
- Production app: `https://www.kubazar.net`
- Supabase production project: `kvmbtbhlapjlhfppomsw`
- Vercel production logs for `ku-online-dev`
- Google sign-in through the configured Supabase OAuth flow

Supabase impact:
- Tables touched by user flow: `products`, `favorites`
- Buckets touched by user flow: `product-images`
- RLS/policies touched by code: none
- Migrations added: none

Validation performed:
- Production project status and RPC readiness rechecked for production and replacement staging.
- Public/protected production health smoke rechecked.
- Google sign-in completed in a real browser session.
- Signed-in Messages menu loaded and `GET /api/messages/conversations` returned `200`.
- Created a temporary sale listing with image upload, verified detail page, category visibility, owner controls, and favorite creation.
- Created a temporary property listing to test rental readiness.
- Removed both temporary smoke listings through the production owner UI.
- Production read-only DB cleanup check returned `matching_smoke_rows: 0` for both temporary smoke listing IDs.
- Vercel production logs checked with `--status-code 500 --since 2h --expand`.
- Browser console checked after cleanup: `0` errors and `0` warnings.

Production result:
- P0 message RPC repair is confirmed in signed-in production use. The prior authenticated messages path no longer fails with the missing-RPC `PGRST202` class of error.
- Core sale-listing creation works through Supabase/storage enough for the listing to render on the detail page and category listing, and deletion cleanup works from the owner UI.
- Search consistency is not production-ready: Candidate P1 repaired the `/api/search/algolia-sync` DB/RPC `500`, but the post-repair sync response is still `{"ok":false}` and title search still fails because Vercel production is missing Algolia provider env vars.
- Rental listing creation is not production-ready: the `/sell` UI did not expose rental/listing-mode controls for the property category, and the property smoke listing was stored as `listing_type = sale` with `rental_term = null`.

Risks and rollout notes:
- Do not treat marketplace search as reliable for new listings until Algolia production env is configured, the index is backfilled, and title-search smoke passes.
- Do not claim rental listing readiness until `/sell` exposes the intended rental controls and persists `listing_type = rent` / `rental_term` correctly.
- No production data from the smoke run remains; both temporary listing records were deleted and verified absent.

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

## Candidate I Security Operations Baseline

Date: 2026-06-20 to 2026-06-21

Goal: execute the next documented Phase 5 security step by reducing dependency risk, creating a secret-rotation runbook draft, and defining privileged-route monitoring thresholds.

Important files changed:
- `package.json`
- `package-lock.json`
- `docs/security/PHASE5_SLICE_A_PART1_BASELINE.md`
- `docs/security/PHASE5_SLICE_A_PART1_CHECKLIST.md`
- `recovery_from_session/security/npm-audit-prod.json`
- `recovery_from_session/security/npm-audit-all.json`

Dependency changes:
- Updated direct packages:
  - `next` to `^16.2.9`
  - `eslint-config-next` to `^16.2.9`
  - `@sentry/nextjs` to `^10.59.0`
  - `next-intl` to `^4.13.0`
  - `postcss` to `^8.5.15`
  - `@supabase/supabase-js` to `^2.108.2`
  - `@supabase/ssr` to `^0.10.3`
- Added npm overrides:
  - `fast-uri`: `3.1.2`
  - `picomatch`: `4.0.4`
  - `ws`: `8.21.0`

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none

Validation performed:
- Audit JSON parse checks: pass
- `npm run check:node`: pass
- `npm ci --ignore-scripts`: pass
- `npx npm@10.9.4 ci --ignore-scripts`: pass
- `npm run typecheck`: pass
- `npm test`: pass
- `npm run lint`: pass
- `npm run check:env` with Vercel production env loaded through a temp file: pass
- `npm run build` with Vercel production env loaded through a temp file: pass
- `npm audit --omit=dev --audit-level=high`: pass
- `npm audit --audit-level=high`: expected fail from deferred dev/deploy tooling advisories
- `npm run perf:budget`: pass
- GitHub CI for commit `0b7c06f`: pass (`27898130848`)
- Vercel production deployment for commit `0b7c06f`: ready (`dpl_WD1vgJdecGtQSdGqpEYzJdH1AzKA`) and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Production smoke for `0b7c06f`: pass for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`
- Protected production health check: `database=ok`, `storage=ok`, `rateLimit.status=ok`, `rateLimit.configured=true`, `rateLimit.source=vercel-kv`, `rateLimit.backend=upstash`

Production interpretation:
- Production audit high advisories dropped from 4 to 0; final `npm audit --omit=dev` has 6 total non-high advisories after npm 10 lockfile normalization.
- Full audit still reports high advisories through dev/deploy tooling paths, mostly the Vercel CLI transitive dependency tree.
- The Vercel CLI fix is a major upgrade from the current repository line and should be handled in a separate tooling slice with CI/deploy validation.
- The first GitHub CI run for `4a2b992` failed before CI scripts because npm 10 required a nested optional `@swc/helpers@0.5.23` lockfile entry. Follow-up commit `0b7c06f` normalized the lockfile, reproduces the GitHub Actions installer path locally, and passed GitHub CI.

Risks and rollout notes:
- Next/Sentry/Supabase/runtime package updates can affect build and runtime behavior; Candidate I has passed local validation, GitHub CI, Vercel deployment, and production smoke, but should still be watched through normal Sentry/Vercel runtime monitoring.
- `npm run check:node` passed on Node `22.21.1`; an earlier install step emitted a transient engine warning from a different local tool runtime.
- Rollback is a normal git revert of Candidate I. No database rollback is required.

## Candidate J Maintenance Workflow Runtime Alignment

Date: 2026-06-21

Goal: restore scheduled production maintenance workflows after the dependency upgrade exposed stale Node 20 workflow runtimes.

Important files changed:
- `.github/workflows/cleanup-expired-listings.yml`
- `.github/workflows/product-i18n.yml`
- `.github/workflows/algolia-synonyms.yml`
- `package.json`
- `package-lock.json`
- `docs/production-readiness.md`
- `docs/production-candidate-checkpoint.md`
- `docs/agent-memory/JOURNAL.md`
- `docs/agent-memory/STATE.json`

Failure evidence:
- Cleanup expired listings run `27898184065` failed on `0b7c06f` before querying or mutating listings.
- Failure cause: `@supabase/realtime-js` initialization on Node 20 threw `Node.js 20 detected without native WebSocket support`.
- `Product translations & embeddings` and `Algolia Synonyms` were also still pinned to Node 20 and had recent scheduled failures after the dependency/lockfile changes.

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none
- Production workflow manual dispatch: not run, because these jobs can mutate production listings, storage, translations, embeddings, and Algolia records.

Validation performed:
- `npx npm@10.9.4 ci --ignore-scripts`: pass
- `npm run check:node`: pass
- Supabase client initialization smoke under Node 22 with dummy credentials: pass
- `npm run typecheck`: pass
- `npm run lint`: pass after restoring dependencies with npm 10
- `npm test`: pass
- `git diff --check`: pass
- GitHub CI for commit `10ba092`: pass (`27898810418`)
- Vercel production deployment for commit `10ba092`: ready (`dpl_Aa8vqtoQjfxz82w5R2w7raN8u7h7`) and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Production smoke for `10ba092`: pass for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`
- Protected production health check: `database=ok`, `storage=ok`, `rateLimit.status=ok`, `rateLimit.configured=true`, `rateLimit.source=vercel-kv`, `rateLimit.backend=upstash`

Production interpretation:
- The 3-month listing lifecycle cleanup path was failing because of workflow runtime drift, not because the cleanup script reached product data and failed mid-mutation.
- The safest fix is to align maintenance workflows with the repo's Node 22 runtime instead of adding per-script WebSocket shims for a stale Node version.
- The workflows should be observed on their next scheduled runs or manually dispatched only after explicit approval.

Risks and rollout notes:
- Manual dispatch can mutate production listings, storage, translations, embeddings, and Algolia indexes; do not run these workflows casually.
- Local default `npm` reports an inconsistent Node 24 runtime and left `node_modules` incomplete during validation. npm 10 was used for lockfile/install validation because it matches the GitHub Actions path already proven by Candidate I.
- Rollback is a normal git revert of Candidate J. No database rollback is required because no production maintenance workflow was manually executed in this slice.

## Candidate K Deploy-Tooling Audit Hardening

Date: 2026-06-21

Goal: clear the remaining full-audit high advisories without carrying Vercel CLI as an app devDependency.

Important files changed:
- `package.json`
- `package-lock.json`
- `scripts/check-tooling-status.mjs`
- `tools/mcp/requirements.json`
- `docs/production-readiness.md`
- `docs/production-candidate-checkpoint.md`
- `docs/security/PHASE5_SLICE_A_PART1_BASELINE.md`
- `docs/security/PHASE5_SLICE_A_PART1_CHECKLIST.md`
- `docs/agent-memory/JOURNAL.md`
- `docs/agent-memory/STATE.json`

Implementation:
- Removed `vercel` from `devDependencies`; Vercel CLI is now external operator tooling.
- Added explicit overrides for patched transitive tooling packages:
  - `flatted`: `3.4.2`
  - `form-data`: `4.0.6`
  - `hono`: `4.12.26`
  - `router > path-to-regexp`: `8.4.2`
- Updated tooling guidance to recommend global `vercel` or `npx vercel@latest`.
- Fixed Windows `.cmd` shim resolution in `scripts/check-tooling-status.mjs`.

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none

Validation performed:
- `npx npm@10.9.4 ci --ignore-scripts`: pass
- `npm audit --audit-level=high`: pass; full audit has 0 high/critical advisories and 30 total non-high advisories
- `npm audit --omit=dev --audit-level=high`: pass; production audit has 0 high/critical advisories and 6 total non-high advisories
- `vercel --version`: pass with global CLI `54.9.1`
- `vercel whoami`: pass as `gepardi-dot`
- `npm run check:node`: pass
- `npm run tooling:status`: pass for required Vercel/Supabase checks, with Supabase MCP support warning
- `npm run mcp:auto:deploy`: pass for required Vercel deploy gate, with optional GitHub MCP blocked by missing MCP-specific token
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run check:env` with Vercel production env loaded through a temp file: pass
- `npm run build` with Vercel production env loaded through a temp file: pass
- `npm run perf:budget`: pass
- GitHub CI `27919595935`: pass for commit `8224378`
- Vercel production deployment `dpl_Hh7tiXrxJoMEzgkeccnXq83UnmWr`: ready
- Production smoke: `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, `https://ku-online-dev.vercel.app/api/health`, and the deployment URL `/api/health` returned HTTP 200
- Protected production health: database `ok`, storage `ok`, rateLimit `ok`, rateLimit configured `true`, source `vercel-kv`, backend `upstash`

Production interpretation:
- The app build/runtime no longer carries Vercel CLI dependency risk.
- Deploy operators can still use the authenticated global Vercel CLI or `npx vercel@latest`.
- Full-audit high/critical advisories are locally cleared; remaining audit items are non-high.

Risks and rollout notes:
- Removing repo-pinned Vercel CLI means local operators need a global CLI or `npx vercel@latest`.
- A failed `npm run check:env` attempt happened in the older linked local repo at `C:\Users\miroa\Downloads\kubazar-dev`; the candidate worktree passed with the same pulled production env.
- The production env temp file used for protected-health verification was deleted after reading the token.
- Rollback is a normal git revert of Candidate K. No database rollback is required.

## Candidate L Scheduled Maintenance Workflow Observation

Date: 2026-06-22

Goal: observe scheduled production maintenance workflows after the Node 22 alignment without manually dispatching jobs that can mutate production data.

Important files changed:
- `docs/production-readiness.md`
- `docs/production-candidate-checkpoint.md`
- `docs/agent-memory/JOURNAL.md`
- `docs/agent-memory/STATE.json`

Implementation:
- Performed read-only GitHub Actions inspection.
- Did not edit workflow definitions or app code.
- Did not manually dispatch cleanup, i18n, embedding, synonym, storage, Supabase, or Algolia maintenance jobs.

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none
- Production jobs manually dispatched: none

Validation performed:
- `gh auth status`: pass with repo/workflow scope.
- `git status -sb`: clean before observation.
- Workflow definitions inspected: `cleanup-expired-listings.yml`, `product-i18n.yml`, and `algolia-synonyms.yml` are active and configured for Node 22.
- `Cleanup expired listings` run `27942446708`: success on commit `0afff39`; logs showed Node `22.22.3`, npm `10.9.8`, and `Cleanup complete. Total expired listings processed: 0.`
- `Product translations & embeddings` run `27936502407`: success on commit `0afff39`; all steps passed. Logs showed Algolia settings updated, product translation backfill completed with 0 products updated, and product embeddings already populated.
- `Algolia Synonyms` run `27937125441`: success on commit `0afff39`; logs showed 0 auto synonym sets generated from 0 clicks and 4 synonym sets synced.
- Additional post-Candidate-J product maintenance scheduled successes observed: `27901389780`, `27904202989`, `27907664311`, `27910406643`, `27912878415`, and `27916057862`.
- Earlier product/i18n failures on commit `4a2b992`: confirmed as `npm ci` lockfile drift (`@swc/helpers@0.5.23` missing before `0b7c06f`).
- Earlier cleanup run `27898184065`: confirmed as the pre-Candidate-J Node 20 WebSocket failure before product mutation.
- Earlier Algolia Synonyms run `27896749972`: confirmed as the pre-lockfile-normalization `npm ci` failure before the sync step.

Production interpretation:
- Product translation/embedding, cleanup, and Algolia Synonyms scheduled maintenance are observed healthy after the dependency, lockfile, and Node 22 fixes.
- GitHub scheduled workflows are best-effort. Observed product workflow timing did not behave like a strict 30-minute SLA, so this is acceptable for non-urgent enrichment work but weak for time-critical production operations.

Risks and rollout notes:
- Do not manually dispatch cleanup/i18n/synonyms workflows without explicit production approval; they can mutate production listings, storage, translations, embeddings, and Algolia indexes.
- Continue normal run monitoring; one green scheduled run does not prove long-term reliability.
- If exact maintenance timing becomes important, add freshness monitoring or move critical maintenance to a scheduler with stronger delivery guarantees.

## Candidate M Legacy Admin-Token Route Parity Hardening

Date: 2026-06-22

Goal: keep legacy admin-token automation compatible while making token handling and service-role client setup consistent with newer hardened internal routes.

Important files changed:
- `src/lib/security/admin-token.ts`
- `src/lib/security/__tests__/admin-token.test.ts`
- `src/app/api/admin/moderate/route.ts`
- `src/app/api/admin/announcements/route.ts`
- `src/app/api/admin/revalidate/route.ts`
- `src/app/api/internal/health/route.ts`
- `docs/production-readiness.md`
- `docs/production-candidate-checkpoint.md`
- `docs/security/SECURITY_PHASE_NOTES.md`
- `docs/security/SERVICE_ROLE_INVENTORY.md`
- `docs/agent-memory/JOURNAL.md`
- `docs/agent-memory/STATE.json`

Implementation:
- Added shared admin-token extraction and timing-safe comparison helper.
- Preserved existing `x-admin-token` support.
- Added `Authorization: Bearer <token>` support for legacy token-admin routes.
- Reused the helper in the internal health diagnostics route.
- Added explicit non-persistent service-role auth options in `admin/moderate` and `admin/announcements`.
- Removed token-length/equality debug logging from `admin/revalidate`.

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none
- Production jobs manually dispatched: none

Validation performed:
- `npm run mcp:ensure`: pass.
- `npm run mcp:auto:core`: pass after pulling Vercel production env into ignored `.env.local` for local validation.
- Targeted ESLint for changed helper/test/routes: pass.
- `npm run build:test`: pass.
- `npm test`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass on retry with a longer timeout after the first lint command timed out at 120 seconds without a failure result.
- `npm run build`: pass with `.env.local` loaded from Vercel production env. Initial build without env failed at `/robots.txt` page-data collection because required public env vars were absent.
- Code commit: `d104fb7`.
- GitHub CI: run `27949940304` passed.
- Vercel production deployment: `dpl_D4j3SU7FTsREweXC7n2HUW7pGxDA` ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Canonical production smoke on `https://www.kubazar.net`: homepage `200`, public health `200`, protected internal health with `Authorization: Bearer` `200` with database/storage/rate-limit checks `ok`.

Production interpretation:
- Token-admin routes now share one timing-safe authorization path instead of repeating direct string comparisons.
- Operator compatibility is preserved because the legacy header still works.
- Bearer token support aligns these routes with the protected internal health endpoint and safer CLI/operator usage.

Risks and rollout notes:
- Low behavior risk; authorization remains tied to the same `ADMIN_REVALIDATE_TOKEN`.
- Rollback is a normal git revert. No database rollback is required.
- `.env.local` and `.vercel/` were created only for local validation and are ignored.
- Operator scripts that use `Authorization: Bearer` should call the canonical host `https://www.kubazar.net`; the apex host redirects to `www`, and cross-host redirects can drop the `Authorization` header. Legacy `x-admin-token` was not affected in smoke testing.

## Candidate N Privileged-Route Observability

Date: 2026-06-22

Goal: make high-risk admin/internal route decisions visible in production logs without exposing secrets or changing provider alert settings yet.

Important files changed:
- `src/lib/security/privileged-route-observability.ts`
- `src/lib/security/__tests__/privileged-route-observability.test.ts`
- `src/app/api/admin/moderate/route.ts`
- `src/app/api/admin/announcements/route.ts`
- `src/app/api/admin/revalidate/route.ts`
- `src/app/api/internal/health/route.ts`
- `tools/test-stubs/alias-loader.mjs`
- `docs/security/PRIVILEGED_ROUTE_OBSERVABILITY.md`
- `docs/production-readiness.md`
- `docs/production-candidate-checkpoint.md`
- `docs/security/SECURITY_PHASE_NOTES.md`
- `docs/security/SERVICE_ROLE_INVENTORY.md`
- `docs/agent-memory/JOURNAL.md`
- `docs/agent-memory/STATE.json`

Implementation:
- Added a shared helper that emits `[privileged-route]` structured events.
- Event payloads include route, method, event, outcome, status, timestamp, normalized host/origin, request id when available, user-agent family, and hashed client identifier.
- Sensitive values are excluded: token, secret, authorization, cookie, API key, raw IP, request body, announcement title/body.
- Added events for forbidden origin/host, unauthorized requests, rate-limit hits, privileged mutation success/failure, misconfiguration, and failed internal diagnostics.
- Kept internal health success quiet to avoid noisy logs; failed diagnostics are logged with safe check statuses.

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none
- Provider alert settings changed: none
- Production jobs manually dispatched: none

Validation performed:
- `npm run mcp:ensure`: pass.
- `npm run mcp:auto:core`: pass after pulling Vercel production env into ignored `.env.local` for local validation. Initial run before env pull had a Supabase-local soft warning; no DB/RLS/storage/provider mutation was performed.
- Targeted ESLint for changed helper/test/routes: pass.
- `npm run build:test`: pass.
- `npm test`: pass after the compiled-test ESM loader fix.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run build`: pass with `.env.local` loaded from Vercel production env.
- Code commit: `5ae9b7b`.
- GitHub CI: run `27952977699` passed.
- Vercel production deployment: `dpl_FxF18o2AqUmMexss8yK2DPicApBQ` ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Canonical production smoke on `https://www.kubazar.net`: homepage `200`, public health `200`, protected internal health with `Authorization: Bearer` `200` with database/storage/rate-limit checks `ok`.
- Observability smoke: deliberate unauthenticated `GET /api/internal/health` returned `401`, and Vercel logs for deployment `dpl_FxF18o2AqUmMexss8yK2DPicApBQ` contained a redacted `[privileged-route]` event with `route=internal/health`, `event=unauthorized`, `outcome=denied`, and a hashed client identifier.

Production interpretation:
- Operators can now search Vercel/Sentry-ingested logs for `[privileged-route]` and group by route/event/outcome/status/clientHash.
- Provider-side alert rules should be added deliberately in a separate approved provider-mutation phase.

Risks and rollout notes:
- Expected log volume is low because success logging is limited to privileged mutations and health success is not logged.
- Rollback is a normal git revert. No database rollback is required.
- `.env.local` was created only for local validation and is ignored.
- The observability smoke intentionally generated one production `401` event for verification.

## Candidate O Secret Rotation Readiness

Date: 2026-06-23

Goal: turn the Phase 5 secret-rotation baseline into a repeatable operator runbook and local readiness check without rotating secrets or mutating providers.

Important files changed:
- `tools/scripts/secret-rotation-readiness.mjs`
- `package.json`
- `docs/security/SECRET_ROTATION_RUNBOOK.md`
- `docs/production-readiness.md`
- `docs/production-candidate-checkpoint.md`
- `docs/security/SECURITY_PHASE_NOTES.md`
- `docs/security/SERVICE_ROLE_INVENTORY.md`
- `docs/agent-memory/JOURNAL.md`
- `docs/agent-memory/STATE.json`

Implementation:
- Added a presence-only readiness checker for required and recommended production env names.
- Added the `npm run security:secrets:readiness` command.
- Added a production-safe rotation runbook with staging-first order, MCP gates, variable-specific verification, rollback notes, and approval template.
- Kept payments, vouchers, and subscriptions out of scope.

Supabase impact:
- Tables touched: none
- Buckets touched: none
- RLS/policies touched: none
- Migrations added: none
- Production secrets rotated: none
- Provider settings changed: none

Validation performed:
- `node --check tools/scripts/secret-rotation-readiness.mjs`: pass.
- `node tools/scripts/secret-rotation-readiness.mjs --help`: pass.
- `npm run security:secrets:readiness -- --no-env-files --mode production` with command-scoped placeholder env: pass.
- `node tools/scripts/secret-rotation-readiness.mjs --no-env-files --mode production` with no required env values set: expected fail; output listed only missing variable/group names.
- `node -e "JSON.parse(...STATE.json...)"`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `git diff --check`: pass.
- `npm run build`: not run; no app runtime code changed.
- Code commit: `b3a138e`.
- GitHub CI: run `28034201187` passed.
- Vercel production deployment: `dpl_4ThYGRQphDEqC1Ks6zGXsQdPDD6J` ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Production public smoke: `https://www.kubazar.net/`, `/api/health`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health` returned HTTP `200`.
- Protected production health on `https://www.kubazar.net/api/internal/health`: database `ok`, storage `ok`, rateLimit `ok`, rateLimit configured `true`, source `vercel-kv`, backend `upstash`.

Production interpretation:
- Operators now have a concrete way to check whether the environment contains the expected secret groups before attempting rotation.
- The runbook defines the safe order for future rotation but does not itself change live credentials.

Risks and rollout notes:
- The checker proves presence, not correctness. Live verification still requires protected health, auth, search, SMS, workflow, and provider-specific smoke checks after any real rotation.
- Rollback for this slice is a normal git revert. No database or provider rollback is required.
- Production env was pulled into a temporary OS file only to read `ADMIN_REVALIDATE_TOKEN` for protected health verification; the temp file was deleted by the same command and no secret values were printed.

## Candidate P0 Supabase Parity Repair

Date: 2026-06-23

Goal: repair active production Supabase drift that was causing deployed authenticated messaging code to call missing secure RPCs.

Original production evidence:
- Vercel production logs show `GET /api/messages/conversations` returning `500` with Supabase `PGRST202`.
- Supabase production read-only metadata confirms `public.list_conversation_summaries_secure()` is missing.
- Production currently exposes only legacy `public.list_conversation_summaries(p_user_id uuid)` among the checked conversation-list functions.
- Production has the message/conversation/product/user profile tables needed by the secure message RPCs.
- Production does not have `products.listing_type` or `products.rental_term`, while deployed sell/edit code sends both columns.
- Production `products.images` is `text[]`; production search RPCs still have older signatures without listing-mode parameters or return fields.
- Production has no listing-mode product constraints or listing-mode/category index.
- Supabase legacy staging read-only SQL timed out even on `select 1`; `supabase projects list -o json` reports staging project `iypynouqbmmvoqecfmuw` as `INACTIVE`, so staging availability is a gate before normal staging-first DB mutation.
- `GET /v1/projects/iypynouqbmmvoqecfmuw/restore` reports available restore version `supabase-postgres-17.6.1.063`.
- Approved `POST /v1/projects/iypynouqbmmvoqecfmuw/restore` on 2026-06-24 failed because Supabase reported that the project has been paused for more than 90 days and cannot be restored.
- Replacement staging project `cuotmvhhgakjeqdsfziu` (`ku-online-staging`, `eu-central-1`) is `ACTIVE_HEALTHY` and has been initialized with all 99 repository migration files through both P0 repair migrations.
- A schema-only persistent branch attempt for `ku-online-staging-p0` failed with `402` because Supabase Branching requires the Pro plan or above. No branch was created.
- Production was repaired on 2026-06-24 with the two P0 migrations and now passes `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`.

Important files under review:
- `src/app/api/messages/conversations/route.ts`
- `src/app/api/messages/conversations/[id]/route.ts`
- `src/app/api/messages/conversations/[id]/messages/route.ts`
- `src/app/api/messages/conversations/[id]/read/route.ts`
- `src/app/api/messages/[id]/route.ts`
- `src/app/api/search/algolia-sync/route.ts`
- `supabase/migrations/20260223110158_messages_conversation_messages_secure_rpc.sql`
- `supabase/migrations/20260223113222_messages_conversation_detail_secure_rpc.sql`
- `supabase/migrations/20260223120007_messages_conversation_summaries_secure_rpc.sql`
- `supabase/migrations/20260223122014_messages_mark_conversation_read_secure_rpc.sql`
- `supabase/migrations/20260223124555_messages_delete_secure_rpc.sql`
- `supabase/migrations/20260223131619_messages_delete_conversation_secure_rpc.sql`
- `supabase/migrations/20260223145649_algolia_sync_secure_product_row_rpc.sql`
- `supabase/migrations/20260310120838_add_property_listing_modes.sql`
- `supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`
- `supabase/migrations/20260624143000_product_listing_mode_parity.sql`
- `docs/security/CANDIDATE_P0_SUPABASE_RPC_REPAIR.md`
- `tools/scripts/supabase-rpc-readiness.mjs`
- `tools/scripts/supabase-project-status.mjs`
- `tools/scripts/supabase-apply-sql.mjs`
- `tools/scripts/run-tests.mjs`
- `tools/scripts/__tests__/*.test.mjs`
- `package.json`

Supabase impact applied:
- Tables touched: `public.products` for the listing-mode parity substep.
- Buckets touched: none.
- RLS/policies touched: none.
- Functions touched: secure message RPCs, `get_algolia_product_row_secure`, and legacy plus listing-mode search RPC signatures.
- Algolia RPC compatibility: returns listing-mode fields when columns exist and safe defaults when production has not received those columns yet.
- Migrations added and applied to production:
  - `supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`
  - `supabase/migrations/20260624143000_product_listing_mode_parity.sql`

Completed execution:
- Used the prepared narrow SQL repair bundle and rollback notes.
- Used the guarded SQL apply command with `--confirm-write --confirm-project-ref <same-ref>` and `--record-migration` so `supabase_migrations.schema_migrations` stayed aligned.
- Use `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15` to verify the replacement staging project is healthy before any staging foundation work.
- Use the custom listing-mode compatibility migration, not a direct application of the March migration.
- For listing-mode parity, add columns/index/constraints and add the new overloaded search RPC signatures while preserving older signatures during rollout.
- Build a production-like staging foundation before mutation, or get an explicit user override to bypass staging.
- Because the existing staging project cannot be restored and Supabase Branching is unavailable on the current plan, standalone staging was initialized with the repository migration chain.
- Applied to production only after staging validation and explicit user approval.
- Verified production function metadata, Vercel logs, health endpoints, and signed-out behavior for the affected messages endpoint.

Risks and rollout notes:
- Do not blindly apply every missing local migration. Production has later remote migration versions, and one local sponsor click migration targets a table that does not exist in production.
- Do not apply the March listing-mode migration verbatim. Production still has `products.images` as `text[]` and older search RPC signatures; the safer path is a custom compatibility migration that keeps old signatures and adds new ones.
- Secure RPCs use `SECURITY DEFINER`; ownership checks and execute grants must be reviewed before production mutation.
- Local `supabase db reset` applies the migration chain and records `20260623152000`, but the CLI exits non-zero at the final storage bucket readiness check because it probes `127.0.0.1:54321` while Docker published local Kong on `127.0.0.1:55321`. Treat that as local CLI/Docker port drift, not evidence that this repair migration failed.
- Local `supabase db reset` now applies through `20260624143000`; it still exits non-zero at the final storage readiness probe for the same local CLI/Docker port drift.

Validation performed:
- Docker Desktop started and local Supabase is reachable through Docker's published local Kong port.
- DB MCP gate passes when local Supabase status env names are mapped to `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` for the command.
- `supabase db reset`: SQL migrations applied through `20260623152000`, then failed at final storage readiness check on the CLI-reported port.
- Authenticated storage bucket readiness against Docker's actual published port `127.0.0.1:55321` returned `200`.
- Local metadata confirmed migration `20260623152000` exists.
- Local metadata confirmed all seven secure RPCs exist.
- Local metadata confirmed `get_algolia_product_row_secure` contains listing-mode compatibility logic.
- Production read-only metadata confirmed the listing-mode schema gap: missing columns, missing constraints/index, old search RPC signatures, and `products.images` as `text[]`.
- Code audit confirmed sell/edit writes and product filters depend on the missing listing-mode columns; no direct app-side search RPC calls were found.
- Added and expanded `npm run supabase:rpc:readiness` for read-only pre/post repair checks, including listing-mode columns, image type, constraints, indexes, and search RPC signatures.
- Added `npm run supabase:project:status`, a read-only project status/wait helper for post-restore and pre-apply gates.
- Added offline `node:test` coverage for operator-tool argument parsing, write confirmation gates, readiness SQL generation, and readiness failure detection.
- Added `supabase/migrations/20260624143000_product_listing_mode_parity.sql`. A first local reset caught an argument-name incompatibility with pre-existing listing-mode overloads; the migration was corrected and then applied locally.
- Local metadata after reset confirmed both P0 migration versions, listing-mode columns/defaults, validated constraints, listing-mode index, and all four legacy/listing-mode search RPC signatures.
- `node --check tools/scripts/supabase-rpc-readiness.mjs`: pass.
- `node tools/scripts/supabase-rpc-readiness.mjs --help`: pass.
- `node --check tools/scripts/supabase-project-status.mjs`: pass.
- `node tools/scripts/supabase-project-status.mjs --help`: pass.
- `node --check tools/scripts/supabase-apply-sql.mjs`: pass.
- `node --check tools/scripts/run-tests.mjs`: pass.
- CLI help for `supabase-apply-sql`, `supabase-project-status`, and `supabase-rpc-readiness`: pass.
- Missing `--confirm-write` CLI failure path: pass; the command fails before token lookup or network access.
- `node --test tools/scripts/__tests__/*.test.mjs`: pass.
- `npm test`: pass; includes the offline operator-tool tests through `tools/scripts/run-tests.mjs`.
- `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: expected fail; production is active but missing both P0 migrations, all seven secure RPCs, both listing-mode columns, all three listing-mode constraints, the listing-mode product index, and both listing-mode search RPC signatures. The checker reports `products.images` as `_text` and `2/4` search RPC signatures present.
- `npm run supabase:rpc:readiness -- --project-ref iypynouqbmmvoqecfmuw`: expected fail; staging is `INACTIVE`.
- Approved staging restore request: failed with Supabase message that the project has been paused for more than 90 days and cannot be restored.
- `npm run supabase:project:status -- --project-ref iypynouqbmmvoqecfmuw`: pass as read-only command; status remains `INACTIVE`.
- `supabase projects create ku-online-staging --org-id kuvczlcnafiantkddyqk --region eu-central-1 ...`: created replacement staging project `cuotmvhhgakjeqdsfziu`; generated DB password was not printed or stored.
- `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15`: pass.
- `supabase branches list --project-ref kvmbtbhlapjlhfppomsw -o json`: only the default production `main` branch is listed; no replacement production-clone branch is currently available.
- `supabase branches create ku-online-staging-p0 --project-ref kvmbtbhlapjlhfppomsw --region eu-central-1 --persistent -o json --yes`: failed with `402`; Supabase Branching is unavailable on the current plan. Follow-up branch list still shows only default `main`.
- Updated `npm run supabase:rpc:readiness` to default to production plus replacement staging and to handle blank Supabase projects by reporting missing migration metadata instead of crashing on `supabase_migrations.schema_migrations`.
- Before initialization, `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu` failed as expected because replacement staging was active but blank.
- Updated `npm run supabase:sql` migration mode and offline tests so future approved Management API migration applies can record the migration version after SQL execution.
- Applied all 99 repository migration files to standalone staging `cuotmvhhgakjeqdsfziu` with `tools/scripts/supabase-apply-sql.mjs --confirm-write --confirm-project-ref cuotmvhhgakjeqdsfziu --record-migration`. Production was not targeted.
- `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15`: pass.
- `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu`: pass; no issues. Required P0 migrations `2/2`, secure RPCs `7/7`, listing-mode columns present, constraints `3/3`, one listing-mode index candidate, and search RPC signatures `4/4`.
- Staging sanity query: `99` migrations recorded, `13` categories, `product-images` bucket exists and is public.
- `npm run supabase:parity -- --prod-ref kvmbtbhlapjlhfppomsw --staging-ref cuotmvhhgakjeqdsfziu`: expected fail/drift. Staging has the P0 repair objects and no missing tables/functions relative to production, but it is ahead of production by repo migrations and lacks five production-only reader/TTS migration-history rows.
- Production pre-apply `npm run supabase:project:status -- --project-ref kvmbtbhlapjlhfppomsw --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15`: pass.
- Production pre-apply `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: expected fail, confirming the two P0 migrations and related objects were still missing.
- Production apply `npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`: pass; migration `20260623152000` recorded.
- Production apply `npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260624143000_product_listing_mode_parity.sql`: pass; migration `20260624143000` recorded.
- Production post-apply `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: pass; no issues.
- Production public smoke returned `200` for `/api/health`, `/`, and `/sell`.
- Production protected internal health returned `200` with database/storage/rate-limit `ok`.
- Production signed-out `/api/messages/conversations` returned `401`, not `500`.
- Recent Vercel production error-log check after apply returned no error records in the checked window.
- `node -e "JSON.parse(...package.json...); JSON.parse(...STATE.json...)"`: pass.
- `git diff --check`: pass.
- `npm test`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: first run failed because local public Supabase env values were absent; rerun with a temporary pulled Vercel production env file passed, and the temporary file was deleted.
- Source-control closeout commit `0b3da09` pushed to `main`.
- GitHub CI run `28121756571` for commit `0b3da09`: pass.
- Vercel production deployment `dpl_81akCqA4Qu3XvLuCW9gAxv8rcU9C`: ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Post-deploy public smoke returned `200` for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`.
- Post-deploy protected internal health returned database/storage/rate-limit `ok`.
- Post-deploy signed-out `/api/messages/conversations` returned `401`, not `500`.
- Post-deploy Vercel log scan for the new deployment showed only expected smoke traffic and no error-level records in the checked window.
