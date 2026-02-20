# Repository Guidelines

## Project Structure & Module Organization
The production app lives under `src/`. UI entrypoints are in `src/app/` (App Router) with route-specific components beside their data loaders. Shared UI lives in `src/components/`, utilities in `src/utils/`, and Supabase/domain logic in `src/lib/`. Generated build output (`.next/`) and dependencies (`node_modules/`) should stay untracked. Configuration files such as `next.config.ts`, `tailwind.config.mjs`, and `.env.local` control runtime and styling behaviour.

## Build, Test, and Development Commands
- `npm run dev` – start the Next.js dev server on port 5000 for local work.
- `npm run build` – produce the optimized Vercel deployment bundle.
- `npm run start` – serve the production bundle locally for smoke tests.
- `npm run lint` / `npm run typecheck` – enforce ESLint rules and TypeScript correctness before merging.

## Coding Style & Naming Conventions
Write TypeScript with strict typing; prefer explicit interfaces for Supabase payloads. Components should use PascalCase filenames (`ProductGallery.tsx`), hooks camelCase, and Tailwind utility classes for styling. Keep line length reasonable (<120 chars) and rely on ESLint/Prettier defaults triggered via `next lint`. Co-locate helper modules when they are route-specific; otherwise place shared logic under `src/lib`.

## Testing Guidelines
Automated tests are not yet scaffolded; when adding them, colocate Playwright or Vitest suites under `src/` mirroring the feature path (e.g., `src/app/sell/__tests__/`). At minimum, run `npm run build` and `npm run start` before shipping to ensure the production bundle succeeds.

## Supabase / Database Workflow (Required)
Treat Supabase schema/policy changes like code changes: develop and validate locally first, then promote via migrations.

### Rules of engagement
- **Never** apply schema/policy changes directly on the production Supabase project “just to test”.
- Prefer **local Supabase (CLI)** for development and validation; treat `supabase/migrations/` as the source of truth.
- When reporting work, **explicitly state** whether you ran against **local** Supabase or a **remote** project.

### Mandatory workflow for any DB/policy/storage change
Follow these steps even if the user doesn’t explicitly ask for `supabase db diff` / `supabase db reset`.
1) **Run locally**: start/verify local Supabase is running with `supabase start` (or check `supabase status`).
2) **Point the app to local Supabase** while developing DB changes (update `.env.local` using values from `supabase status`).
3) Make the change locally (SQL, Studio, functions/policies), then verify via `npm run dev` on `http://localhost:5000`.
4) **Create a migration**: `supabase db diff -f <short_slug>` and commit the new file(s) under `supabase/migrations/`.
5) **Prove reproducibility** (don’t skip): run `supabase db reset`, then re-run the app/tests to confirm the migrations fully recreate the DB state.

### Promotion / applying to remote
- Only run `supabase db push` when the user asks to **apply/promote** the migration to a remote environment (e.g., staging/production).
- Default to pushing to **staging/preview** first; production pushes should be treated as high-risk and require explicit user intent.

### Parity Workflow (When staging/local differ from production)
1) Detect schema drift first (before coding):
- `npm run supabase:parity -- --prod-ref <production_ref> --staging-ref <staging_ref> --keep-dumps`
- This check now compares: migrations, tables, columns (type/null/default), functions, policies, constraints, and triggers.
- It uses Supabase Management API (`SUPABASE_ACCESS_TOKEN`) and does **not** require Docker.

2) Keep admin-role testing reproducible across environments:
- `npm run supabase:admin:grant -- --email <admin_email> --create-missing --password <temporary_password>`
- This sets auth role claim (`app_metadata.role`) to `admin` and ensures a row exists in `public.users`.
- Add `--local` to target local Supabase from `supabase status -o env`.

3) If drift includes production-only objects, codify them in a migration and apply to staging first.
- Reference migration: `supabase/migrations/20260209194500_align_schema_with_production_drift.sql`.
- Apply SQL safely via management API script:
  - `npm run supabase:sql -- --project-ref <staging_ref> --file supabase/migrations/20260209194500_align_schema_with_production_drift.sql`
- Prefer this targeted SQL apply when `supabase/migrations` contains newer feature migrations you do **not** want to push yet.

4) After parity is restored, continue normal migration workflow:
- Develop locally, generate migration, reset locally, then push to staging and finally production.

## Commit & Pull Request Guidelines
Follow the conventional tone used in history (`feat:`, `fix:`, `chore:`). Each commit should group related changes and include any required schema or configuration updates. Pull requests must describe the problem, the Supabase tables/buckets touched, and include screenshots or screen recordings for UI updates. Tag the issue tracker ID in the PR title or description when applicable.

## Security & Configuration Tips
Secrets are managed via Vercel environment variables; never commit `.env.local`. Ensure Supabase storage buckets (e.g., `product-images`) are provisioned and policies verified before deploying. When modifying auth or storage rules, document the change in the PR and confirm Vercel preview builds succeed at https://ku-online.vercel.app/.

## MCP Acquisition Protocol (Required)
Use MCP selectively and deliberately. The goal is to acquire MCP when it materially improves correctness/safety, and keep MCP off when unnecessary.

### Core rule
For high-risk domains, you must not proceed until MCP readiness is confirmed (or the user explicitly overrides).

### Mandatory flow
1) Ensure MCP availability baseline before implementation:
- `npm run mcp:ensure`
2) Classify task risk + domain.
3) Prefer one-step autopilot:
- `npm run mcp:auto -- --task <ui|core|db|deploy|comms>`
4) If not using autopilot, select and activate the MCP profile from `docs/mcp/task-matrix.md`:
- `minimal` (default): high-value MCPs off.
- `core`: Supabase read-only + Vercel.
- `db-admin`: Supabase write-capable + optional remote Supabase MCP.
- `deploy`: Vercel-focused.
- `comms`: Vonage-focused.
5) Run `npm run mcp:doctor -- --profile <profile>` before high-risk execution (autopilot does this automatically).
6) If blocked, use doctor checklist output and ask the user only for missing config/actions.
7) If non-blocked, continue and report active profile + doctor outcome in your summary.
8) At task end, return to minimal with `npm run mcp:off` (autopilot auto-resets after command execution unless `--keep-profile` is used).

### Risk gates
Hard gate (MCP required before execution):
- DB schema, RLS, storage, auth policy, or migration operations.
- Deployment diagnostics / production environment operations.
- External provider operations (Vonage API actions).

Soft gate (MCP recommended but fallback allowed with explicit warning):
- Local UI/refactor/documentation tasks.
- Low-risk read-only code exploration where MCP is not required for correctness.

### Commands
- `npm run mcp:ensure`
- `npm run mcp:auto -- --task <ui|core|db|deploy|comms> [-- <command> ...]`
- `npm run mcp:auto:core`
- `npm run mcp:auto:db`
- `npm run mcp:auto:deploy`
- `npm run mcp:auto:comms`
- `npm run mcp:profile -- list`
- `npm run mcp:profile -- activate <profile>`
- `npm run mcp:status`
- `npm run mcp:doctor -- --profile <profile> [--emit-checklist] [--json] [--strict]`
- `npm run mcp:off`

### Safety rules
- Never commit secrets to tracked config files (`.cursor/mcp.json`, docs, JSON contracts).
- Keep user secrets in `.env.local` or user-level client config only.
- Treat `.cursor/mcp.json` as generated from `tools/mcp/profiles.json`.
