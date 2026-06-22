# KU BAZAR Production Readiness

Last updated: 2026-06-22

## Current Status

KU BAZAR should still be treated as a production-capable beta until abuse resistance, operational access, deployment discipline, and real-traffic performance are consistently proven.

The current hardening focus is to preserve the intended C2C marketplace behavior while improving production confidence. Intentional product decisions remain in place: public product browsing for signed-out users, contact/actions gated by sign-in, no marketplace payments for now, and automatic product lifecycle cleanup after roughly three months.

## Latest Candidate

Candidate M: legacy admin-token route parity hardening.

Changes:
- Added shared timing-safe admin token helper in `src/lib/security/admin-token.ts`.
- Added unit coverage for Bearer token support, legacy `x-admin-token` fallback, missing expected-token rejection, and mismatched-token rejection.
- Updated legacy token-admin routes to use the shared helper:
  - `src/app/api/admin/moderate/route.ts`
  - `src/app/api/admin/announcements/route.ts`
  - `src/app/api/admin/revalidate/route.ts`
- Updated `src/app/api/internal/health/route.ts` to reuse the shared helper instead of carrying a route-local implementation.
- Added explicit service-role client auth options (`persistSession: false`, `autoRefreshToken: false`) to the remaining token-admin service-role clients in `admin/moderate` and `admin/announcements`.
- Removed non-production token-length debug logging from `admin/revalidate`.

Validation:
- `npm run mcp:ensure`: pass.
- `npm run mcp:auto:core`: pass after pulling Vercel production env into ignored `.env.local` for local validation.
- Targeted ESLint for changed route/helper/test files: pass.
- `npm run build:test`: pass.
- `npm test`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass on retry with a longer timeout after the first lint command timed out at 120 seconds without a failure result.
- `npm run build`: pass with `.env.local` loaded from Vercel production env. Initial build without env failed at `/robots.txt` page-data collection because required public env vars were absent.
- Code commit: `d104fb7`.
- GitHub CI: run `27949940304` passed.
- Vercel production deployment: `dpl_D4j3SU7FTsREweXC7n2HUW7pGxDA` ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Canonical production smoke on `https://www.kubazar.net`: homepage `200`, public health `200`, protected internal health with `Authorization: Bearer` `200` with database/storage/rate-limit checks `ok`.

Known notes:
- Existing `x-admin-token` callers remain supported.
- `Authorization: Bearer <token>` is now supported on the legacy admin-token routes.
- No Supabase schema, table, bucket, RLS, storage, auth-provider, provider, or migration changes were made.
- `.env.local` and `.vercel/` are local ignored files created only for validation and must not be committed.
- Operator scripts that use `Authorization: Bearer` should call the canonical host `https://www.kubazar.net`; the apex host redirects to `www`, and cross-host redirects can drop the `Authorization` header. Legacy `x-admin-token` was not affected in smoke testing.

## Previous Candidate

Candidate L: scheduled maintenance workflow observation.

Scope:
- Read-only GitHub Actions inspection only.
- No workflow dispatches were run.
- No production listing, storage, translation, embedding, Algolia, Supabase, or provider mutations were triggered by this phase.

Observed workflows:
- `Cleanup expired listings` (`.github/workflows/cleanup-expired-listings.yml`): active, now configured for Node 22, daily cron.
- `Product translations & embeddings` (`.github/workflows/product-i18n.yml`): active, now configured for Node 22, scheduled cron.
- `Algolia Synonyms` (`.github/workflows/algolia-synonyms.yml`): active, now configured for Node 22, daily cron.

Validation:
- GitHub CLI auth: pass with repo/workflow scope.
- Worktree before observation: clean.
- `Cleanup expired listings`: scheduled run `27942446708` passed on commit `0afff39`; logs showed Node `22.22.3`, npm `10.9.8`, and `Cleanup complete. Total expired listings processed: 0.`
- `Product translations & embeddings`: scheduled run `27936502407` passed on commit `0afff39`; logs showed Algolia settings updated, product translation backfill completed with 0 products updated, and product embeddings already populated.
- `Algolia Synonyms`: scheduled run `27937125441` passed on commit `0afff39`; logs showed 0 auto synonym sets generated from 0 clicks and 4 synonym sets synced.
- Earlier `Product translations & embeddings` scheduled runs after Candidate J also passed: `27901389780`, `27904202989`, `27907664311`, `27910406643`, `27912878415`, `27916057862`, `27918545148`, `27920270241`, and `27924895874`.
- Earlier `Product translations & embeddings` failures on commit `4a2b992` failed at `npm ci` because the lockfile was missing `@swc/helpers@0.5.23`; this was the Candidate I lockfile issue fixed by `0b7c06f`.
- Earlier `Cleanup expired listings` failure `27898184065` on commit `0b7c06f` failed before product mutation because the workflow used Node 20 and Supabase realtime initialization required native WebSocket support.
- Earlier `Algolia Synonyms` failure `27896749972` on commit `4a2b992` failed at `npm ci` before the synonym sync step.

Production interpretation:
- Product translation/embedding, cleanup, and Algolia synonym maintenance are now observed healthy on the current `main` commit after the Node 22 and lockfile fixes.
- Manual dispatch remains intentionally avoided because these workflows can mutate production listings, storage, translations, embeddings, and Algolia indexes.

Known notes:
- GitHub scheduled workflows are best-effort. The observed product workflow cadence was not a strict 30-minute interval, so do not treat GitHub Actions schedule timing as a hard production SLA.
- Continue observing these workflows in normal operations; do not assume one green day proves long-term reliability.
- If exact timing becomes production-critical, move the critical maintenance trigger to a scheduler with stronger delivery semantics or add freshness alerting around missed GitHub scheduled runs.

## Earlier Candidate

Candidate K: deploy-tooling audit hardening.

Changes:
- Removed the repo-pinned `vercel` devDependency because the app does not need Vercel CLI to build or run, and the latest package still carried audit noise through deploy-tooling transitive dependencies.
- Kept Vercel CLI as external operator tooling through the authenticated global CLI or `npx vercel@latest`.
- Added narrow npm overrides for patched transitive tooling dependencies: `flatted`, `form-data`, `hono`, and `router > path-to-regexp`.
- Updated tooling/MCP guidance so future checks do not reintroduce `vercel` as a devDependency.
- Fixed `scripts/check-tooling-status.mjs` Windows command resolution for global `.cmd` shims.

Validation:
- `npx npm@10.9.4 ci --ignore-scripts`: pass
- `npm audit --audit-level=high`: pass; full audit now has 0 high/critical advisories and 30 total non-high advisories
- `npm audit --omit=dev --audit-level=high`: pass; production audit remains 0 high/critical with 6 total non-high advisories
- `vercel --version`: pass with global CLI `54.9.1`
- `vercel whoami`: pass as `gepardi-dot`
- `npm run check:node`: pass
- `npm run tooling:status`: pass for Vercel/Supabase required checks; Supabase MCP support remains a warning because the installed Supabase CLI does not expose `supabase mcp`
- `npm run mcp:auto:deploy`: pass for the required Vercel deploy gate; optional GitHub MCP remains blocked by missing MCP-specific token
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass
- `npm run check:env`: pass with Vercel production env loaded through a temp file
- `npm run build`: pass with Vercel production env loaded through a temp file
- `npm run perf:budget`: pass
- GitHub CI `27919595935`: pass for commit `8224378`
- Vercel production deployment `dpl_Hh7tiXrxJoMEzgkeccnXq83UnmWr`: ready
- Production smoke: `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, `https://ku-online-dev.vercel.app/api/health`, and the deployment URL `/api/health` returned HTTP 200
- Protected production health: database `ok`, storage `ok`, rateLimit `ok`, rateLimit configured `true`, source `vercel-kv`, backend `upstash`

Known notes:
- No Supabase schema, table, bucket, RLS, storage, auth-provider, provider, or migration changes were made.
- The failed `npm run check:env` attempt in `C:\Users\miroa\Downloads\kubazar-dev` was from the older linked local repo, not this candidate worktree.
- Global Vercel CLI remains available for deployment operations; it is intentionally no longer part of the app dependency tree.
- The production env temp file used for protected-health verification was deleted after reading the token.

## Earlier Candidate

Candidate J: production maintenance workflow Node 22 alignment.

Changes:
- Moved the scheduled `Cleanup expired listings`, `Product translations & embeddings`, and `Algolia Synonyms` workflows from Node 20 to Node 22.
- Aligned `package.json` and `package-lock.json` `engines.node` with the repository's real Node policy: Node 22.
- Preserved the npm 10 lockfile shape needed by GitHub Actions.

Validation:
- Failed cleanup run inspected: `27898184065` failed before any listing query/mutation because Supabase client initialization on Node 20 lacks native WebSocket support.
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

Known notes:
- No Supabase schema, table, bucket, RLS, storage, auth-provider, provider, or migration changes were made.
- The maintenance workflows use production service-role/provider credentials when they run. They were not manually dispatched during local validation to avoid unintended production mutations.
- Local default `npm` reports an inconsistent Node 24 runtime and can leave `node_modules` incomplete; npm 10 was used for lockfile and install validation because it matches the GitHub Actions path already proven by Candidate I.

## Earlier Candidate

Candidate I: Phase 5 security-operations baseline and dependency remediation.

Changes:
- Created Phase 5 dependency/secret-rotation/monitoring baseline documentation.
- Captured `npm audit --omit=dev` and full `npm audit` JSON artifacts under `recovery_from_session/security/`.
- Applied a narrow dependency remediation batch for direct runtime/tooling packages within current major lines.
- Added npm overrides for patched transitive versions of `fast-uri`, `picomatch`, and `ws`.

Validation:
- Audit JSON parse checks: pass
- `npm run check:node`: pass
- `npm ci --ignore-scripts`: pass
- `npx npm@10.9.4 ci --ignore-scripts`: pass
- `npm run typecheck`: pass
- `npm test`: pass
- `npm run lint`: pass
- `npm run check:env`: pass with Vercel production env loaded through a temp file
- `npm run build`: pass with Vercel production env loaded through a temp file
- `npm audit --omit=dev --audit-level=high`: pass
- `npm audit --audit-level=high`: expected fail from deferred dev/deploy tooling advisories at the time of Candidate I; resolved locally by Candidate K
- `npm run perf:budget`: pass
- GitHub CI for commit `0b7c06f`: pass (`27898130848`)
- Vercel production deployment for commit `0b7c06f`: ready (`dpl_WD1vgJdecGtQSdGqpEYzJdH1AzKA`) and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Production smoke for `0b7c06f`: pass for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`
- Protected production health check: `database=ok`, `storage=ok`, `rateLimit.status=ok`, `rateLimit.configured=true`, `rateLimit.source=vercel-kv`, `rateLimit.backend=upstash`

Known notes:
- No Supabase schema, table, bucket, RLS, storage, auth-provider, provider, or migration changes were made.
- Production high advisories dropped from 4 to 0 in `npm audit --omit=dev`; the final production audit after npm 10 lockfile normalization has 6 total non-high advisories.
- Candidate K later removed the repo-pinned Vercel CLI package and cleared full-audit high advisories locally.
- `npm run check:node` passed on Node `22.21.1`; an earlier install step emitted a transient engine warning from a different local tool runtime.
- The first GitHub CI run for `4a2b992` failed at `npm ci` because npm 10 expected a nested optional `@swc/helpers@0.5.23` lockfile entry. Follow-up commit `0b7c06f` normalized the lockfile with npm 10; local `npx npm@10.9.4 ci --ignore-scripts` and GitHub CI now pass.

## Older Candidate

Candidate H: production Upstash rate-limit rollout.

Changes:
- Connected Vercel project `ku-online-dev` to Upstash for Redis resource `ku-bazar-rate-limit`.
- Used the Vercel marketplace-provided `KV_REST_API_URL` and `KV_REST_API_TOKEN` names as supported Redis credentials for the existing rate-limit backend.
- Added token-protected internal health diagnostics for the active rate-limit backend without exposing secrets.
- Kept fail-open memory fallback behavior if Redis is missing or temporarily unavailable.

Validation:
- `npm run typecheck`: pass
- `npm test`: pass
- `npm run lint`: pass
- `npm run build`: pass with Vercel production env loaded through a temp file
- `npm run check:env`: pass with Vercel production env loaded through a temp file
- GitHub CI for commit `e58b60f`: pass
- Vercel production deployment `dpl_EH2x1nXMub1jvh2PV97oDUJ7ExaQ`: ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`
- Protected production health check: `database=ok`, `storage=ok`, `rateLimit.status=ok`, `rateLimit.configured=true`, `rateLimit.source=vercel-kv`, `rateLimit.backend=upstash`
- Live smoke passed for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`

Known notes:
- No Supabase schema, table, bucket, RLS, storage, auth-provider, or migration changes were made.
- Upstash resource settings at rollout: free plan, `iad1`, production environment only, `eviction=true`, `prodPack=false`, `autoUpgrade=false`.
- Upstash free tier is acceptable for controlled beta hardening, but paid capacity/SLA should be revisited before broad public launch or heavy traffic.
- During provider setup, one manual Vercel deploy was accidentally attempted from the candidate worktree and created a temporary local link to a wrong Vercel project name. That failed deployment did not replace `ku-online-dev`; the local `.vercel` link was removed and the correct `ku-online-dev` production redeploy was used.

## Older Candidate

Candidate G: durable rate-limit backend preparation.

Changes:
- Added a shared fixed-window rate-limit backend with optional Upstash Redis REST enforcement.
- Added support for Vercel marketplace KV env names, so either `UPSTASH_REDIS_REST_*` or `KV_REST_API_*` can activate the durable backend.
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
- Candidate G was initially deployed to production as commit `5736b21` / Vercel `dpl_2ZHSbR5dzBJCYAeuF6Tjh2CggrgU`.
- Vercel KV env compatibility was deployed as commit `9b7a923`; compatibility deployment evidence includes `dpl_AAn5ps7xKpTTTrgqDZFGwTU1GCH8`.
- After the Upstash resource was connected, production was redeployed as `dpl_7ttK4suGvWAsWDfrRqHJDnYmDFgZ` before the final health-diagnostic deployment.
- Live smoke passed for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`.
- Production now uses the Vercel KV/Upstash backend after Candidate H.
- If Upstash is unavailable, the app logs a server warning and falls back to in-memory throttling to avoid taking down legitimate user flows.

## Performance Candidate

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
- Full dependency audit has no high/critical advisories after Candidate K local validation; remaining audit findings are non-high.
- Distributed rate limiting is active through Vercel KV/Upstash, but the current provider resource is on the free plan. Revisit plan limits, eviction behavior, and SLA before broad public launch.
- Production maintenance workflows should be observed on their next schedules; manual dispatch is intentionally avoided unless approved because these jobs can mutate production listings, translations, embeddings, Algolia indexes, and storage.
- C2C abuse workflows still need continuous hardening: reporting, blocking, moderation queues, repeat-offender detection, and auditability.
- Server-side service-role paths should continue to receive ownership checks, tests, and audit logging.
- Local and production environment parity should be checked before DB, auth, provider, storage, or deploy mutations.
