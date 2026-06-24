# Candidate P0 Supabase RPC Repair

Date: 2026-06-23

## Problem

Production Vercel logs show `GET /api/messages/conversations` returning `500` with Supabase `PGRST202` because deployed code calls `public.list_conversation_summaries_secure()` and production does not have that function.

Read-only production metadata also showed:
- Only legacy `public.list_conversation_summaries(p_user_id uuid)` exists among the checked conversation-list functions.
- Core message tables exist: `public.conversations`, `public.messages`, `public.products`, and `public.public_user_profiles`.
- `products.listing_type` and `products.rental_term` are missing, while sell/edit code sends those fields. That listing-mode drift is a separate P0 follow-up because the March migration also rewrites search functions.

## Migration

Prepared migration:

```text
supabase/migrations/20260623152000_repair_secure_rpc_parity.sql
supabase/migrations/20260624143000_product_listing_mode_parity.sql
```

The secure RPC migration recreates the missing secure RPC surface required by current deployed code:
- `public.list_conversation_messages_secure(uuid, timestamptz, integer)`
- `public.get_conversation_detail_secure(uuid)`
- `public.list_conversation_summaries_secure()`
- `public.mark_conversation_read_secure(uuid)`
- `public.delete_message_secure(uuid)`
- `public.delete_conversation_secure(uuid)`
- `public.get_algolia_product_row_secure(uuid)`

It also revokes `anon`/`public` execute on the secure functions and grants execute to `authenticated` and `service_role`.

`get_algolia_product_row_secure` is compatibility-safe for the current drift: it returns `listing_type` and `rental_term` when those product columns exist, and falls back to `listing_type = 'sale'` / `rental_term = null` when production has not received the listing-mode schema migration yet.

The listing-mode parity migration intentionally replaces the unsafe March migration path. It:
- Adds `products.listing_type` and `products.rental_term` idempotently.
- Normalizes existing rows into constraint-compatible values before validation.
- Adds and validates the listing-mode constraints.
- Adds the active/unsold category/listing/rental/created-at product index.
- Recreates the legacy search RPC signatures without listing-mode return fields.
- Adds the listing-mode search RPC overloads with `listing_type` and `rental_term` return fields.
- Uses `to_jsonb(p.images)` so production's current `text[]` image column remains compatible.

## Staging Apply Gate

Readiness check for the replacement staging project:

```bash
npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu
```

Verify that replacement staging is healthy before any foundation work:

```bash
npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15
```

Do not apply the two P0 repair migrations directly to the blank replacement staging project. They assume the app baseline schema already exists. The staging-first path now requires either:
- initialize/link the replacement staging project with the app baseline schema, then apply the P0 migrations there, or
- provision a production-clone staging branch/path, then apply the P0 migrations there.

Normal SQL apply path after a production-like staging foundation exists:

```bash
npm run mcp:auto -- --task db --doctor-only --keep-profile
npm run supabase:sql -- --project-ref <staging-ref> --confirm-write --confirm-project-ref <staging-ref> --record-migration --file supabase/migrations/20260623152000_repair_secure_rpc_parity.sql
npm run supabase:sql -- --project-ref <staging-ref> --confirm-write --confirm-project-ref <staging-ref> --record-migration --file supabase/migrations/20260624143000_product_listing_mode_parity.sql
```

Current blocker:
- The DB MCP gate now passes when local Supabase status env names are mapped to `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` for the command.
- Supabase remote access is ready.
- Staging read-only SQL timed out even on `select 1`.
- `supabase projects list -o json` reports staging project `iypynouqbmmvoqecfmuw` as `INACTIVE`.
- `GET /v1/projects/iypynouqbmmvoqecfmuw/restore` reports available restore version `supabase-postgres-17.6.1.063`.
- Approved `POST /v1/projects/iypynouqbmmvoqecfmuw/restore` on 2026-06-24 failed because Supabase reported that the project has been paused for more than 90 days and cannot be restored.
- `npm run supabase:project:status -- --project-ref iypynouqbmmvoqecfmuw` still reports staging `INACTIVE`.
- Replacement staging project `cuotmvhhgakjeqdsfziu` (`ku-online-staging`, `eu-central-1`) was created and is `ACTIVE_HEALTHY`.
- Before initialization, the replacement staging project was blank and `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu` failed cleanly with missing migration metadata and missing app schema objects.
- `supabase branches list --project-ref kvmbtbhlapjlhfppomsw -o json` lists only the default production `main` branch; no production-clone branch is currently available.
- `supabase branches create ku-online-staging-p0 --project-ref kvmbtbhlapjlhfppomsw --region eu-central-1 --persistent -o json --yes` failed with `402` because Supabase Branching requires the Pro plan or above. No branch was created.

Standalone staging initialization completed:
- Used the active standalone staging project `cuotmvhhgakjeqdsfziu`.
- Applied all 99 repository migration files to staging with `tools/scripts/supabase-apply-sql.mjs --confirm-write --confirm-project-ref cuotmvhhgakjeqdsfziu --record-migration`.
- Production was not targeted.
- `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu`: pass; no issues.
- Staging sanity query: `99` migrations recorded, `13` categories, `product-images` bucket exists and is public.
- `npm run supabase:parity -- --prod-ref kvmbtbhlapjlhfppomsw --staging-ref cuotmvhhgakjeqdsfziu`: expected drift because standalone staging is not a production clone. Staging has no missing tables/functions relative to production and includes the P0 repair objects. Production has five reader/TTS migration-history rows absent from staging: `books_and_highlights`, `reader_progress_and_audio_progress`, `rls_policies`, `storage_bucket_and_policies`, and `revert_reader_tts_tables`.

Production apply completed on 2026-06-24 after explicit approval. Keep the commands below as the executed production record and as rollback context.

Fallback risk:
- Standalone staging validates a clean migration chain, not a production clone. It is less representative than a schema-only production branch, but Branching is unavailable on the current plan.
- Production currently has additional reader/TTS migration-history rows that are not in the repository staging chain. Do not run broad migration catch-up on production.
- Production apply must be limited to the two P0 repair migrations unless a separate production migration-parity phase is planned and approved.

## Local Validation

Local validation on 2026-06-24:
- Docker Desktop started successfully.
- DB MCP gate passed with command-scoped local Supabase env mapping.
- `supabase db reset` applied migrations through `20260623152000_repair_secure_rpc_parity.sql`.
- The reset command exits non-zero at the final storage bucket readiness check because the CLI probes `127.0.0.1:54321`, while Docker published local Kong on `127.0.0.1:55321`.
- Authenticated storage bucket readiness against the actual published port returned `200`; treat this as local CLI/Docker port drift, not evidence that the repair migration failed.
- Local metadata confirmed migration `20260623152000` exists.
- Local metadata confirmed all seven secure RPCs exist.
- Local metadata confirmed `get_algolia_product_row_secure` includes listing-mode compatibility logic.
- Added `npm run supabase:rpc:readiness`, a read-only Supabase Management API checker for project status, required secure RPCs, execute grants, migration presence, listing-mode column drift, image type, constraints, indexes, and search RPC signatures.
- Added `supabase/migrations/20260624143000_product_listing_mode_parity.sql` and updated readiness checks to require both P0 migration versions.
- First local reset after adding `20260624143000` failed because existing local listing-mode RPC overloads already had argument names from the March migration; the custom migration now keeps those names to be compatible with existing local or remote overloads.
- Follow-up local `supabase db reset` applied through both P0 migrations, then failed only at the known final storage readiness probe on `127.0.0.1:54321`.
- Local DB metadata confirmed both P0 migration versions, listing-mode columns/defaults, validated constraints, listing-mode index, and all four search RPC signatures.
- Added offline `node:test` coverage for the operator tooling:
  - SQL write mode requires `--confirm-write --confirm-project-ref <same-ref>`.
  - Migration apply mode can record the `<14-digit-version>_<name>.sql` file in `supabase_migrations.schema_migrations`.
  - Project-status wait parsing keeps explicit timeout/interval settings and rejects invalid values.
  - Readiness SQL generation includes the secure RPC repair target and both legacy/listing-mode search signatures.
  - Readiness failure detection is driven by report errors.
- `node --check tools/scripts/supabase-rpc-readiness.mjs`: pass.
- `node tools/scripts/supabase-rpc-readiness.mjs --help`: pass.
- `node --check tools/scripts/supabase-apply-sql.mjs`: pass.
- `node --check tools/scripts/supabase-project-status.mjs`: pass.
- `node --check tools/scripts/run-tests.mjs`: pass.
- CLI help for `supabase-apply-sql`, `supabase-project-status`, and `supabase-rpc-readiness`: pass.
- Missing `--confirm-write` CLI failure path: pass; the command fails before token lookup or network access.
- `node --test tools/scripts/__tests__/*.test.mjs`: pass.
- `npm test`: pass; the normal project test command now includes the offline operator-tool tests.
- `node tools/scripts/supabase-project-status.mjs --help`: pass.
- `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: expected fail; production is active but missing both P0 migrations, all seven secure RPCs, both listing-mode columns, all three listing-mode constraints, the listing-mode product index, and both listing-mode search RPC signatures.
- `npm run supabase:rpc:readiness -- --project-ref iypynouqbmmvoqecfmuw`: expected fail; staging is `INACTIVE`.
- Before initialization, `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu` failed as expected because replacement staging was active but blank.
- After initialization, `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu`: pass; no issues.
- Production apply `npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260623152000_repair_secure_rpc_parity.sql`: pass; migration `20260623152000` recorded.
- Production apply `npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260624143000_product_listing_mode_parity.sql`: pass; migration `20260624143000` recorded.
- Production post-apply `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: pass; no issues.
- Production public smoke returned `200` for `/api/health`, `/`, and `/sell`.
- Production protected internal health returned `200` with database/storage/rate-limit `ok`.
- Signed-out `/api/messages/conversations` returned `401`, not `500`.
- `node -e "JSON.parse(...package.json...); JSON.parse(...STATE.json...)"`: pass.
- `git diff --check`: pass.
- `npm test`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: first run failed because the local shell lacked required public Supabase env values; rerun with a temporary pulled Vercel production env file passed. The temporary file was deleted and is not tracked.
- Closeout recheck `npm run supabase:project:status -- --project-ref kvmbtbhlapjlhfppomsw --expect ACTIVE_HEALTHY --timeout-seconds 120 --interval-seconds 10`: pass.
- Closeout recheck `npm run supabase:project:status -- --project-ref cuotmvhhgakjeqdsfziu --expect ACTIVE_HEALTHY --timeout-seconds 120 --interval-seconds 10`: pass.
- Closeout recheck `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw`: pass; no issues.
- Closeout recheck `npm run supabase:rpc:readiness -- --project-ref cuotmvhhgakjeqdsfziu`: pass; no issues.

## Production Apply Gate

Production apply completed on 2026-06-24 after staging verification and explicit user approval.

Applied production commands:

```bash
npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260623152000_repair_secure_rpc_parity.sql
npm run supabase:sql -- --project-ref kvmbtbhlapjlhfppomsw --confirm-write --confirm-project-ref kvmbtbhlapjlhfppomsw --record-migration --file supabase/migrations/20260624143000_product_listing_mode_parity.sql
```

Verified success signal:
- SQL apply exited `0` for both migrations.
- `npm run supabase:project:status -- --project-ref kvmbtbhlapjlhfppomsw --expect ACTIVE_HEALTHY --timeout-seconds 300 --interval-seconds 15` reports production healthy.
- `npm run supabase:rpc:readiness -- --project-ref kvmbtbhlapjlhfppomsw` shows both P0 migrations recorded, all seven secure functions present with expected execute grants, and listing-mode schema/search gates complete.
- Recent Vercel production error-log check after apply returned no error records in the checked window.
- Source-control closeout commit `0b3da09` was pushed to `main`.
- GitHub CI run `28121756571` for commit `0b3da09`: pass.
- Vercel production deployment `dpl_81akCqA4Qu3XvLuCW9gAxv8rcU9C`: ready and aliased to the canonical production domains.
- Post-deploy public smoke returned `200` for canonical health, homepage, `/sell`, apex health, and the Vercel app health URL.
- Post-deploy protected internal health returned database/storage/rate-limit `ok`, with rate limiting backed by Vercel KV/Upstash.
- Post-deploy Vercel log scan for the new deployment showed only expected smoke traffic and no error-level records in the checked window.

## Rollback SQL

Rollback removes only the functions introduced by the repair and restores authenticated execute on the legacy conversation-summary RPC if it exists.

```sql
drop function if exists public.list_conversation_messages_secure(uuid, timestamp with time zone, integer);
drop function if exists public.get_conversation_detail_secure(uuid);
drop function if exists public.list_conversation_summaries_secure();
drop function if exists public.mark_conversation_read_secure(uuid);
drop function if exists public.delete_message_secure(uuid);
drop function if exists public.delete_conversation_secure(uuid);
drop function if exists public.get_algolia_product_row_secure(uuid);

do $$
begin
  if to_regprocedure('public.list_conversation_summaries(uuid)') is not null then
    grant execute on function public.list_conversation_summaries(uuid) to authenticated;
    grant execute on function public.list_conversation_summaries(uuid) to service_role;
  end if;
end $$;
```

Rollback risk:
- Current deployed code depends on the secure functions. Rolling back without reverting app code will reintroduce the production `PGRST202` failures.
- Dropping `products.listing_type` or `products.rental_term` would break deployed sell/edit/search/Algolia paths. Roll back listing-mode changes only with an app rollback or a forward repair that preserves compatible defaults.

## Follow-Up

Remaining P0 follow-up is authenticated browser/user-flow smoke, not another schema repair. The minimum flow to test with a real signed-in user is:
- open messages and confirm the conversation list loads without a `PGRST202`/`500`
- create a sale listing and a rental/property listing
- upload at least one product image
- search/filter for sale and rental listings
- favorite a listing
- start or open a conversation

Do not run broad production migration catch-up. Production still has reader/TTS migration-history rows that are intentionally not part of this P0 repair.
