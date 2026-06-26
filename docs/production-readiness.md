# KU BAZAR Production Readiness

Last updated: 2026-06-26

## Current Status

KU BAZAR should still be treated as a production-capable beta until abuse resistance, operational access, deployment discipline, and real-traffic performance are consistently proven.

The current hardening focus is to preserve the intended C2C marketplace behavior while improving production confidence. Intentional product decisions remain in place: public product browsing for signed-out users, contact/actions gated by sign-in, no marketplace payments for now, and automatic product lifecycle cleanup after roughly three months.

## Latest Candidate

Candidate P1/P1b/P1c/P1d: Algolia secure product-row RPC repair plus provider rollout and search runtime cleanup.

User-visible outcome:
- New listing creation should no longer produce a production `500` from `/api/search/algolia-sync` because of the broken secure product-row RPC body.
- Marketplace title search now has the required Vercel production Algolia env names, a fresh production redeploy, a backfilled Algolia product index, and a controlled public-search smoke that found and cleaned up a temporary listing.
- Signed-in listing creation now reaches `/api/search/algolia-sync` successfully with `{"ok":true}`, and the new listing appears in title search before owner cleanup.
- Valid no-result searches no longer call the stale Supabase `product-search` Edge Function, and search click telemetry can insert under production RLS.

Current production state:
- Migration `20260625104000_fix_algolia_product_row_secure.sql` was applied to replacement staging and production on 2026-06-25 and recorded in `supabase_migrations.schema_migrations`.
- `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw` now requires all three repair migrations and reports the Algolia product-row RPC body as `ok`.
- Signed-in production smoke created temporary listing `571fdb0a-daab-4f4c-a952-03636a5c7fc1`; product insert returned `201`, `/api/search/algolia-sync` returned HTTP `200`, and no recent `500` logs were found.
- The same signed-in smoke originally returned `{"ok":false}` from the sync endpoint and title search did not find the listing because Vercel production did not have usable Algolia provider env configured at that time.
- Manual Algolia provider rollout run `28200724605` passed on 2026-06-25 after the workflow was corrected for the linked Vercel project and Vercel sensitive-env behavior. It synced the Algolia env names, redeployed production, and backfilled the index; the backfill logged `Indexed 17` and `Algolia indexing complete`.
- GitHub Actions smoke run `28201312665` created temporary product `fdea28c2-91bf-42b2-a9f4-508e091fbdeb`, inserted it into production, indexed it in Algolia, verified direct Algolia search with `nbHits=1`, verified public `/api/products/search` with `count=1` / `items=1`, then deleted the Algolia object and production DB row.
- Signed-in production smoke on 2026-06-26 created temporary listing `34c8165d-2bef-4441-8ec3-a51f3faa0786`; product insert returned `201`, `/api/search/algolia-sync` returned `200` with `{"ok":true}`, title search showed the listing, owner deletion returned `200`, public `/api/products/search` later returned `count: 0`, and a read-only production DB count returned `matching_smoke_rows: 0`.
- Candidate P1d removed the hot-path Supabase `product-search` Edge Function fallback from app search. When Algolia is configured and returns `0` hits, the app now returns that valid empty result; if Algolia is unavailable, the app falls back to the existing Supabase product query instead of invoking the stale edge function.
- Production RLS migration `20260223100328_search_click_events_rls_insert_policies.sql` was applied to `kvmbtbhlapjlhfppomsw` on 2026-06-26 with `--record-migration`. Read-only verification shows `search_click_events_insert_anonymous` and `search_click_events_insert_authenticated` policies present, and migration history records `20260223100328`.
- Runtime `/api/search/click` smoke on 2026-06-26 returned `{"ok":true}` for an existing active product after the RLS policy apply; the previous production RLS `42501` failure did not recur in the checked Vercel error-log window.
- Commit `b18b3eb` was pushed to `main`, GitHub CI run `28242646711` passed, and Vercel production deployment `https://ku-online-jw12n222g-ku-onlines-projects.vercel.app` reached `Ready`.
- Post-deploy production smoke on 2026-06-26 passed: `/api/health` returned `ok`, existing product search for `earbuds` returned `count: 1` / `items: 1`, no-result search for `KU_BAZAR_NO_RESULT_SMOKE_20260626_XYZ` returned `count: 0`, `/api/search/click` returned `{"ok":true}`, and Vercel error logs in the checked window returned no records.
- Vercel production deployment is `Ready`, and public `https://www.kubazar.net/api/health` returned `200` after the rollout and smoke.
- The temporary smoke listing was removed through the production owner UI and a read-only production DB cleanup check returned `matching_smoke_rows: 0`.

Files and systems involved:
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
- `supabase/migrations/20260223100328_search_click_events_rls_insert_policies.sql`
- Supabase production project `kvmbtbhlapjlhfppomsw`
- Replacement Supabase staging project `cuotmvhhgakjeqdsfziu`
- Vercel production env/logs for `ku-online-dev`

Risks and rollback:
- The SQL repair is a `SECURITY DEFINER` function replacement. It preserves the existing owner/admin/moderator guard, removes the broken dynamic `SELECT INTO`, and keeps execute grants restricted to `authenticated` and `service_role`.
- Rollback would reintroduce the known production `42601` sync crash, so prefer a forward fix unless a new regression is proven.
- Search provider/runtime readiness is now proven by both the controlled public-search smoke and the signed-in create/search/delete smoke.
- Vercel production env values are sensitive and cannot be verified by `vercel env pull`; provider values must be validated through source-secret checks plus runtime smoke.
- The provider rollout workflow can mutate Algolia keys, Vercel production env, Vercel production deployment, and the Algolia product index. It must remain manual-only and requires explicit approval before dispatch.
- The stale production `product-search` Edge Function remains deployed in Supabase but is no longer used by the app search fallback after P1d deploy. A later cleanup phase can either redeploy/remove that function intentionally or leave it unused.

Validation performed:
- `node --check tools/scripts/supabase-rpc-readiness.mjs`: pass.
- `node --test tools/scripts/__tests__/supabase-rpc-readiness.test.mjs`: pass.
- Production readiness before apply failed as expected on missing migration `20260625104000` and the broken dynamic RPC body.
- Staging apply and staging readiness: pass.
- Production apply and production readiness: pass.
- `npm test`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass with temporary Vercel production env loaded; temp env file deleted.
- Signed-in production browser smoke: mixed. The DB/RPC `500` is fixed, but provider/indexing is not complete because Algolia env is absent in Vercel production.
- `node --check tools/scripts/algolia-search-key.mjs`: pass.
- `node --test tools/scripts/__tests__/algolia-search-key.test.mjs`: pass.
- `npm test`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- Manual Algolia provider rollout workflow dispatches: first failed before provider mutation because the configured Algolia key could not manage API keys; second got past search-key resolution but failed before Vercel env sync because the GitHub `VERCEL_TOKEN` could not access the forced Vercel scope; third confirmed the GitHub `VERCEL_TOKEN` is invalid. No Vercel env, redeploy, backfill, or Algolia index mutation occurred.
- Workflow dispatch `28200601751`: failed at the new value-length verification because Vercel sensitive production envs pull as empty values; it did not redeploy or backfill.
- Workflow dispatch `28200724605`: pass. Vercel Algolia env names verified, production redeployed, and Algolia backfill completed with `Indexed 17`.
- `node --check tools/scripts/algolia-production-smoke.mjs`: pass.
- `node --test tools/scripts/__tests__/algolia-production-smoke.test.mjs`: pass.
- `npm test`: pass with the production smoke helper tests included.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- GitHub CI run `28201304955` for commit `fdb265d`: pass.
- GitHub Actions production smoke run `28201312665`: pass; DB insert, Algolia index, direct search, public API search, Algolia cleanup, and DB cleanup all passed.
- Public production health after rollout/smoke: `200`.
- Signed-in production browser smoke on 2026-06-26: pass for create-to-search sync. Temporary listing `34c8165d-2bef-4441-8ec3-a51f3faa0786` produced product insert `201`, `/api/search/algolia-sync` `200` with `{"ok":true}`, product title search visibility, owner delete `200`, public search cleanup `count: 0`, read-only production DB cleanup `matching_smoke_rows: 0`, and active browser console `0` errors / `0` warnings after cleanup.
- Vercel production log scan on 2026-06-26: mixed. No `/api/search/algolia-sync` `500` was found in the checked window, but `product-search` Edge Function `500` fallback logs and `/api/search/click` RLS `42501` logs were found as separate follow-ups.
- `npm test`: pass after P1d app-search changes.
- `npm run lint`: pass after rerun with longer timeout.
- `npm run typecheck`: pass.
- `npm run build`: pass with temporary Vercel production env loaded; temp env file deleted. Initial build without env failed at `/robots.txt` page-data collection because required env vars were absent locally.
- Production DB MCP gate: pass after starting Docker Desktop and exporting local Supabase status env values for the command process only.
- Production RLS apply: pass; migration `20260223100328` recorded.
- Production read-only RLS verification: pass; anonymous and authenticated `search_click_events` insert policies are present.
- Runtime `/api/search/click` smoke: pass with `{"ok":true}`.
- GitHub CI run `28242646711` for commit `b18b3eb`: pass.
- Vercel production deployment `https://ku-online-jw12n222g-ku-onlines-projects.vercel.app`: Ready.
- Post-deploy production smoke: pass for public health, existing product search, no-result product search, click telemetry, and Vercel error-log scan.

Prior candidate:

Candidate P0: Supabase schema/RPC parity repair (production applied, verified, and authenticated-smoked with follow-up issues).

User-visible outcome:
- Authenticated messaging endpoints should stop returning `500` because required secure RPCs were missing from production.
- Listing creation/editing schema drift is repaired with compatibility-safe product listing-mode schema/search changes.

Original production behavior:
- Vercel production logs show `GET /api/messages/conversations` returning `500` with Supabase `PGRST202` because `public.list_conversation_summaries_secure()` is absent from the production schema cache.
- Production currently has only legacy `public.list_conversation_summaries(p_user_id uuid)` among the checked conversation-list RPCs.
- Production is also missing `products.listing_type` and `products.rental_term` while deployed sell/edit code sends those columns.
- Production `products.images` is `text[]`; production search RPCs still use the older signatures without listing-mode parameters or return fields.
- Production has no listing-mode product constraints or listing-mode/category index.

Current production state:
- The two P0 repair migrations were applied to production on 2026-06-24 and recorded in `supabase_migrations.schema_migrations`.
- `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw` now passes with no issues.
- Production has the required seven secure RPCs, `products.listing_type`, `products.rental_term`, the three listing-mode constraints, the listing-mode index candidate, and all four legacy/listing-mode search RPC signatures.
- Public production smoke for homepage, `/sell`, and `/api/health` returns `200`; protected internal health returns database/storage/rate-limit `ok`.
- Recent Vercel error-log check after the apply returned no error records in the checked window, and signed-out `/api/messages/conversations` returns `401` rather than `500`.
- Authenticated production smoke on 2026-06-25 confirmed Google sign-in, signed-in header controls, and `GET /api/messages/conversations` returning `200` in a real browser session.
- Authenticated sale-listing smoke on 2026-06-25 confirmed image upload/signing, product insert, product detail rendering, category discoverability, favorite creation, owner delete controls, and cleanup through the production UI. Read-only production DB verification returned `matching_smoke_rows: 0` for the two temporary smoke listings after cleanup.
- The authenticated smoke originally found `/api/search/algolia-sync` returning `500` with Supabase error `42601` / `syntax error at or near ","`. Candidate P1 repaired the DB/RPC crash, but title search still did not find the post-repair smoke listing because Vercel production lacks the required Algolia env vars.
- The authenticated smoke also found that the production `/sell` UI does not expose a rental/listing-mode control for property listings. A property smoke listing was stored as `listing_type = sale` with `rental_term = null` and displayed as `For Sale`, so rental listing creation is not production-ready yet.
- A non-blocking accessibility warning was observed for the auth dialog: missing dialog description / `aria-describedby`.
- Legacy staging project `iypynouqbmmvoqecfmuw` is `INACTIVE`. An approved restore attempt on 2026-06-24 failed because Supabase reported that the project has been paused for more than 90 days and cannot be restored.
- Replacement staging project `cuotmvhhgakjeqdsfziu` (`ku-online-staging`, `eu-central-1`) is `ACTIVE_HEALTHY` and has been initialized with the repository migration chain through both P0 repair migrations.
- A schema-only persistent Supabase branch was attempted for production-safe staging, but Supabase returned `402` because Branching is supported only on the Pro plan or above. No branch was created.

Files and systems involved:
- App routes currently depending on secure RPCs:
  - `src/app/api/messages/conversations/route.ts`
  - `src/app/api/messages/conversations/[id]/route.ts`
  - `src/app/api/messages/conversations/[id]/messages/route.ts`
  - `src/app/api/messages/conversations/[id]/read/route.ts`
  - `src/app/api/messages/[id]/route.ts`
  - `src/app/api/search/algolia-sync/route.ts`
- Prepared repair files:
  - `supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`
  - `supabase/migrations/20260624143000_product_listing_mode_parity.sql`
  - `supabase/migrations/20260625104000_fix_algolia_product_row_secure.sql`
  - `docs/security/CANDIDATE_P0_SUPABASE_RPC_REPAIR.md`
  - `tools/scripts/supabase-rpc-readiness.mjs`
  - `tools/scripts/supabase-project-status.mjs`
  - `tools/scripts/supabase-apply-sql.mjs`
  - `tools/scripts/run-tests.mjs`
  - `tools/scripts/__tests__/*.test.mjs`
- Candidate local migrations under review:
  - `supabase/migrations/20260223110158_messages_conversation_messages_secure_rpc.sql`
  - `supabase/migrations/20260223113222_messages_conversation_detail_secure_rpc.sql`
  - `supabase/migrations/20260223120007_messages_conversation_summaries_secure_rpc.sql`
  - `supabase/migrations/20260223122014_messages_mark_conversation_read_secure_rpc.sql`
  - `supabase/migrations/20260223124555_messages_delete_secure_rpc.sql`
  - `supabase/migrations/20260223131619_messages_delete_conversation_secure_rpc.sql`
  - `supabase/migrations/20260223145649_algolia_sync_secure_product_row_rpc.sql`
  - `supabase/migrations/20260310120838_add_property_listing_modes.sql`
- Remote systems: Supabase production project `kvmbtbhlapjlhfppomsw`, replacement Supabase staging project `cuotmvhhgakjeqdsfziu`, legacy inactive staging project `iypynouqbmmvoqecfmuw`, Vercel production logs.

Completed implementation:
- Kept this as a DB repair phase, not an app-code fallback phase. No service-role shortcuts were added for messaging.
- Used the prepared narrow SQL repair bundle for the missing secure message RPCs and compatibility-safe Algolia secure product-row RPC.
- Used the custom listing-mode parity migration rather than applying `20260310120838_add_property_listing_modes.sql` verbatim to production.
- Applied the repair to standalone staging first, then production only after explicit approval.
- Verified production metadata, public smoke, protected internal health, recent error logs, and signed-out behavior for the affected messages endpoint.

Risks and rollback:
- These are `SECURITY DEFINER` functions; incorrect ownership checks would weaken RLS boundaries.
- Broad migration catch-up is unsafe right now because production contains later remote migration versions and some local migration targets are absent remotely.
- Rollback must be prepared as explicit `drop function if exists ...` statements plus privilege restoration for legacy RPCs only if needed.
- Product listing-mode schema repair uses a custom compatibility migration rather than applying `20260310120838_add_property_listing_modes.sql` verbatim.
- Rollback remains risky because current deployed code now depends on the secure RPCs and listing-mode columns. Prefer forward fixes over rollback unless there is a clear production regression.
- Algolia search consistency remains a production risk: the DB/RPC `500` is repaired, but newly created listings can still miss title search until production Algolia env is configured and the index is backfilled/re-smoked.
- Rental listing creation remains a product-readiness gap: the schema now supports `listing_type` and `rental_term`, but the user-facing sell flow did not create a rental listing in the authenticated smoke.

Validation performed so far:
- Vercel production error logs inspected; active `PGRST202` found for `/api/messages/conversations`.
- Supabase production read-only metadata confirmed missing secure RPCs and present legacy `list_conversation_summaries(p_user_id uuid)`.
- Supabase production read-only metadata confirmed required message tables exist.
- Supabase production read-only metadata confirmed `products.listing_type` and `products.rental_term` are absent.
- Supabase production read-only metadata confirmed `products.images` is `text[]`, search RPCs have older signatures without listing-mode parameters/return fields, and no listing-mode constraints or index exist.
- Code audit confirmed sell/edit flows insert/update `listing_type` and `rental_term`; product filters query those columns; Algolia and product-search paths also expect them. No direct app-side `rpc('search_products...')` call was found, but keeping older search RPC signatures is still safer for edge/provider compatibility.
- Docker Desktop was started locally and local Supabase was already running.
- `npm run mcp:auto -- --task db --doctor-only --keep-profile`: pass when local Supabase `API_URL`, `SERVICE_ROLE_KEY`, and `ANON_KEY` are mapped to the expected env names for that command.
- `supabase projects list -o json`: production is `ACTIVE_HEALTHY`; staging is `INACTIVE`.
- `.cursor/mcp.json` was restored after the MCP doctor changed the active profile.
- Prepared repair migration and rollback notes; no Supabase SQL mutation has been executed.
- Hardened `npm run supabase:sql` so write mode requires `--confirm-write --confirm-project-ref <same-ref>` in addition to the DB MCP gate. Management API migration applies can now include `--record-migration` so `supabase_migrations.schema_migrations` is updated after the migration SQL runs.
- Added `npm run supabase:project:status`, a read-only Supabase Management API status/wait helper for post-restore and pre-apply project-health gates.
- Local `supabase db reset` applied all migrations through `20260623152000_repair_secure_rpc_parity.sql`, then failed during the final storage bucket readiness check because the CLI probed `127.0.0.1:54321` while Docker published local Kong on `127.0.0.1:55321`.
- Authenticated storage bucket readiness against `127.0.0.1:55321` returned `200`; the remaining local reset failure is a local CLI/Docker port drift issue, not migration failure evidence.
- Local metadata after the reset confirmed migration `20260623152000` is recorded, all seven secure RPCs exist, and `get_algolia_product_row_secure` contains the listing-mode compatibility logic.
- Added and expanded `npm run supabase:rpc:readiness` to run read-only project, secure RPC, execute grant, migration, listing-mode column, image type, constraint, index, and search RPC signature checks before and after staging/production repair.
- Added `supabase/migrations/20260624143000_product_listing_mode_parity.sql`, a custom listing-mode parity migration that preserves legacy search RPC signatures and adds the listing-mode signatures/columns/index/constraints.
- Updated `npm run supabase:rpc:readiness` so the migration gate now requires both `20260623152000` and `20260624143000`.
- Refactored the new operator scripts to expose pure parsing/report helpers behind direct-run CLI guards so offline tests can import them without touching Supabase.
- Added offline `node:test` coverage for SQL write confirmation gates, project-status wait argument parsing, read-only readiness SQL generation, and readiness failure detection.
- First local `supabase db reset` after adding the listing-mode migration failed at `20260624143000` because Postgres does not allow changing argument names on existing RPC overloads. The migration was corrected to keep the existing argument names.
- Follow-up local `supabase db reset` applied all migrations through `20260624143000_product_listing_mode_parity.sql`, then failed only at the known final storage readiness probe on `127.0.0.1:54321`.
- Local metadata confirmed both P0 migrations are recorded, `products.listing_type` is `text not null default 'sale'`, `products.rental_term` is `text`, all three listing-mode constraints are validated, the listing-mode product index exists, and both legacy plus listing-mode search RPC signatures exist.
- `node --check tools/scripts/supabase-rpc-readiness.mjs`: pass.
- `node tools/scripts/supabase-rpc-readiness.mjs --help`: pass.
- `node --check tools/scripts/supabase-project-status.mjs`: pass.
- `node tools/scripts/supabase-project-status.mjs --help`: pass.
- `node --check tools/scripts/supabase-apply-sql.mjs`: pass.
- `node --check tools/scripts/run-tests.mjs`: pass.
- CLI help for `supabase-apply-sql`, `supabase-project-status`, and `supabase-rpc-readiness`: pass.
- `node tools/scripts/supabase-apply-sql.mjs --project-ref kvmbtbhlapjlhfppomsw --file supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`: expected fail before token lookup with `Write mode requires --confirm-write.`
- `node --test tools/scripts/__tests__/*.test.mjs`: pass.
- `npm test`: pass; now includes the offline operator-tool tests.
- `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: expected fail; production is active but missing both P0 migrations, all seven secure RPCs, both listing-mode columns, all three listing-mode constraints, the listing-mode product index, and both listing-mode search RPC signatures. Production currently has only the two legacy search RPC signatures and `products.images` is `_text`.
- `npm run supabase:rpc:readiness -- --project-ref iypynouqbmmvoqecfmuw`: expected fail; staging is `INACTIVE`.
- `POST https://api.supabase.com/v1/projects/iypynouqbmmvoqecfmuw/restore`: failed; Supabase returned that the project has been paused for more than 90 days and cannot be restored.
- `npm run supabase:project:status -- --project-ref iypynouqbmmvoqecfmuw`: pass as read-only command; status remains `INACTIVE`.
- `supabase projects create ku-online-staging --org-id kuvczlcnafiantkddyqk --region eu-central-1 ...`: created replacement staging project `cuotmvhhgakjeqdsfziu`; generated DB password was not printed or stored.
- `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15`: pass.
- `supabase branches list --project-ref kvmbtbhlapjlhfppomsw -o json`: only the default production `main` branch is listed; no replacement production-clone branch is currently available.
- `supabase branches create ku-online-staging-p0 --project-ref kvmbtbhlapjlhfppomsw --region eu-central-1 --persistent -o json --yes`: failed with `402`; Supabase Branching is unavailable on the current plan. Follow-up `supabase branches list` still shows only default `main`.
- Updated `npm run supabase:rpc:readiness` to default to production plus replacement staging and to handle blank Supabase projects by reporting missing migration metadata instead of crashing on `supabase_migrations.schema_migrations`.
- Before initialization, `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu` failed as expected because replacement staging was active but blank.
- Updated `npm run supabase:sql` migration mode and tests so future approved Management API applies can record P0 migration versions instead of leaving readiness stuck on missing migration history.
- Applied all 99 repository migration files to standalone staging `cuotmvhhgakjeqdsfziu` through `tools/scripts/supabase-apply-sql.mjs` with `--confirm-write --confirm-project-ref cuotmvhhgakjeqdsfziu --record-migration`. Production was not targeted.
- `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15`: pass.
- `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu`: pass; no issues. Required P0 migrations `2/2`, secure RPCs `7/7`, listing-mode columns present, constraints `3/3`, one listing-mode index candidate, and search RPC signatures `4/4`.
- Staging sanity query: `99` migrations recorded, `13` categories, `product-images` bucket exists and is public.
- `npm run supabase:parity -- --prod-ref kvmbtbhlapjlhfppomsw --staging-ref cuotmvhhgakjeqdsfziu`: expected fail/drift. Staging has the P0 repair objects and no missing tables/functions relative to production, but it is ahead of production by the repo migrations and lacks five production-only reader/TTS migration-history rows (`books_and_highlights`, `reader_progress_and_audio_progress`, `rls_policies`, `storage_bucket_and_policies`, `revert_reader_tts_tables`). Treat this as standalone-staging limitation, not production parity.
- Production pre-apply `npm run supabase:project:status -- --project-ref kvmbtbhlapjlhfppomsw --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15`: pass.
- Production pre-apply `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: expected fail, confirming the two P0 migrations and related objects were still missing.
- Production apply `npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`: pass; migration `20260623152000` recorded.
- Production apply `npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260624143000_product_listing_mode_parity.sql`: pass; migration `20260624143000` recorded.
- Production post-apply `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: pass; no issues. Required migrations `2/2`, secure RPCs `7/7`, listing-mode columns present, constraints `3/3`, one listing-mode index candidate, and search RPC signatures `4/4`.
- Production sanity query: both P0 migrations recorded, `18` categories, `product-images` bucket exists and is public.
- Public production smoke: `https://www.kubazar.net/api/health`, `/`, and `/sell` returned `200`.
- Protected production health: `200`; database/storage/rate-limit checks `ok`, rate limit configured via `vercel-kv` / `upstash`.
- Recent Vercel production error-log check after apply returned no error records in the checked window.
- `https://www.kubazar.net/api/messages/conversations` signed-out smoke returned `401`, not `500`.
- `node -e "JSON.parse(...package.json...); JSON.parse(...STATE.json...)"`: pass.
- `git diff --check`: pass.
- `npm test`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: first run failed because the local shell lacked required public Supabase env values; rerun with a temporary pulled Vercel production env file passed, and the temporary env file was deleted.
- Closeout recheck `npm run supabase:project:status -- --project-ref kvmbtbhlapjlhfppomsw --expect ACTIVE_HEALTHY --timeout-seconds 120 --interval-seconds 10`: pass.
- Closeout recheck `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 120 --interval-seconds 10`: pass.
- Closeout recheck `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: pass; no issues.
- Closeout recheck `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu`: pass; no issues.
- Source-control closeout commit `0b3da09` (`fix: repair production Supabase parity`) pushed to `main`.
- GitHub CI run `28121756571` for commit `0b3da09`: pass.
- Vercel production deployment `dpl_81akCqA4Qu3XvLuCW9gAxv8rcU9C`: ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Post-deploy public smoke returned `200` for `https://www.kubazar.net/api/health`, `/`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health`.
- Post-deploy protected internal health returned database/storage/rate-limit `ok`; rate limiting remains configured through `vercel-kv` / `upstash`.
- Post-deploy Vercel log scan for the new deployment showed only expected smoke traffic: health/home/sell `200`, internal health `200`, and signed-out conversations `401`.
- Authenticated production smoke on 2026-06-25:
  - Google sign-in: pass.
  - Signed-in `/api/messages/conversations`: pass, returned `200`.
  - Sale listing create with image upload: pass; product insert returned `201`.
  - Product detail/category visibility and favorite creation: pass.
  - Owner listing deletion and cleanup: pass; production read-only DB count for smoke listing IDs returned `0`.
  - Algolia sync after create: fail; `/api/search/algolia-sync` returned `500`, and Vercel logs show Supabase SQL error `42601` near `,`.
  - Title search for the newly created listing: fail; listing was not discoverable by title search after the sync failure.
  - Property/rental creation: fail for rental readiness; `/sell` did not expose rental controls and stored the property smoke listing as sale with `rental_term = null`.
  - Browser console after cleanup: pass, `0` errors and `0` warnings.

Acceptance criteria:
- Staging and production have the required secure RPCs with authenticated/service-role execute grants and anon/public revoked where intended.
- `/api/messages/conversations` no longer produces `PGRST202` in production logs.
- Listing creation/editing schema drift is fixed at the Supabase schema/RPC level, but search synchronization and rental-listing UI/data behavior are explicitly tracked as follow-up production blockers.
- No unrelated Supabase objects are changed.
- Documentation and agent memory remain current.
- Authenticated browser/user-flow smoke has been completed; the next verification gate is repairing and re-smoking Algolia sync/title search and rental listing creation.

## Previous Candidate

Candidate O: secret rotation readiness and runbook.

Changes:
- Added `docs/security/SECRET_ROTATION_RUNBOOK.md` with staged rotation order, production approval template, variable-specific verification, and rollback notes.
- Added `tools/scripts/secret-rotation-readiness.mjs`, a presence-only checker that does not print secret values.
- Added `npm run security:secrets:readiness`.
- Updated production/security/agent-memory docs so secret rotation work has a concrete, repeatable operator path.

Validation:
- `node --check tools/scripts/secret-rotation-readiness.mjs`: pass.
- `node tools/scripts/secret-rotation-readiness.mjs --help`: pass.
- `npm run security:secrets:readiness -- --no-env-files --mode production` with command-scoped placeholder env: pass.
- `node tools/scripts/secret-rotation-readiness.mjs --no-env-files --mode production` with no required env values set: expected fail; output listed only missing variable/group names.
- `node -e "JSON.parse(...STATE.json...)"`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `git diff --check`: pass.
- Code commit: `b3a138e`.
- GitHub CI: run `28034201187` passed.
- Vercel production deployment: `dpl_4ThYGRQphDEqC1Ks6zGXsQdPDD6J` ready and aliased to `www.kubazar.net`, `kubazar.net`, and `ku-online-dev.vercel.app`.
- Production public smoke: `https://www.kubazar.net/`, `/api/health`, `/sell`, `https://kubazar.net/api/health`, and `https://ku-online-dev.vercel.app/api/health` returned HTTP `200`.
- Protected production health on `https://www.kubazar.net/api/internal/health`: database `ok`, storage `ok`, rateLimit `ok`, rateLimit configured `true`, source `vercel-kv`, backend `upstash`.

Known notes:
- This phase does not rotate secrets.
- This phase does not mutate Vercel, Supabase, Sentry, Vonage, Algolia, OpenAI, Resend, storage, auth providers, RLS, or production data.
- The readiness checker validates required production names and groups only by presence; it intentionally cannot prove that a secret value is correct.
- `npm run build` was not run because this slice changes docs, `package.json` scripts, and a standalone Node operator tool only; no app runtime code changed.
- Production env was pulled into a temporary OS file only to read `ADMIN_REVALIDATE_TOKEN` for protected health verification; the temp file was deleted by the same command and no secret values were printed.

## Earlier Candidate

Candidate N: privileged-route observability.

Changes:
- Added `src/lib/security/privileged-route-observability.ts` for redacted structured privileged-route events.
- Added unit coverage proving the helper hashes client identifiers and strips sensitive subject keys such as token/secret/apiKey.
- Instrumented the token-admin/internal diagnostic routes:
  - `src/app/api/admin/moderate/route.ts`
  - `src/app/api/admin/announcements/route.ts`
  - `src/app/api/admin/revalidate/route.ts`
  - `src/app/api/internal/health/route.ts`
- Updated `tools/test-stubs/alias-loader.mjs` so compiled ESM tests can resolve relative extensionless imports from `dist-tests`.
- Added `docs/security/PRIVILEGED_ROUTE_OBSERVABILITY.md` with event fields, alert thresholds, and operational handling notes.

Validation:
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

Known notes:
- Events are emitted through server logs with `[privileged-route]`.
- Payloads intentionally avoid raw IP, tokens, cookies, authorization headers, announcement body/title, and raw request bodies.
- This phase does not create provider-side Sentry/Vercel alert rules. Alert thresholds are documented for deliberate provider setup later.
- `.env.local` is a local ignored validation file and must not be committed.
- The observability smoke intentionally generated one production `401` event for verification.

## Earlier Candidate

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

## Earlier Candidate

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
