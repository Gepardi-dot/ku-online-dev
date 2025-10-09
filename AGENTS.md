# Repository Guidelines

## Project Structure & Module Organization
The production app lives under `src/`. UI entrypoints are in `src/app/` (App Router) with route-specific components beside their data loaders. Shared UI lives in `src/components/`, utilities in `src/utils/`, and Supabase/domain logic in `src/lib/`. Generated build output (`.next/`) and dependencies (`node_modules/`) should stay untracked. Configuration files such as `next.config.ts`, `tailwind.config.ts`, and `.env.local` control runtime and styling behaviour.

## Build, Test, and Development Commands
- `npm run dev` – start the Next.js dev server on port 5000 for local work.
- `npm run build` – produce the optimized Vercel deployment bundle.
- `npm run start` – serve the production bundle locally for smoke tests.
- `npm run lint` / `npm run typecheck` – enforce ESLint rules and TypeScript correctness before merging.

## Coding Style & Naming Conventions
Write TypeScript with strict typing; prefer explicit interfaces for Supabase payloads. Components should use PascalCase filenames (`ProductGallery.tsx`), hooks camelCase, and Tailwind utility classes for styling. Keep line length reasonable (<120 chars) and rely on ESLint/Prettier defaults triggered via `next lint`. Co-locate helper modules when they are route-specific; otherwise place shared logic under `src/lib`.

## Testing Guidelines
Automated tests are not yet scaffolded; when adding them, colocate Playwright or Vitest suites under `src/` mirroring the feature path (e.g., `src/app/sell/__tests__/`). At minimum, run `npm run build` and `npm run start` before shipping to ensure the production bundle succeeds.

## Commit & Pull Request Guidelines
Follow the conventional tone used in history (`feat:`, `fix:`, `chore:`). Each commit should group related changes and include any required schema or configuration updates. Pull requests must describe the problem, the Supabase tables/buckets touched, and include screenshots or screen recordings for UI updates. Tag the issue tracker ID in the PR title or description when applicable.

## Security & Configuration Tips
Secrets are managed via Vercel environment variables; never commit `.env.local`. Ensure Supabase storage buckets (e.g., `product-images`) are provisioned and policies verified before deploying. When modifying auth or storage rules, document the change in the PR and confirm Vercel preview builds succeed at https://ku-online.vercel.app/.
