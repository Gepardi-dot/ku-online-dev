# Production Candidate Checkpoint

Last updated: 2026-06-21

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
