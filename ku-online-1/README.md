# KU-ONLINE Marketplace - System Overview

> AI-oriented guide to the current frontend codebase so autonomous agents can reason about scope, architecture, and next actions.

## 1. Project Snapshot
- **Product**: KU-ONLINE - a classifieds marketplace for buying/selling within Kurdistan.
- **Frontend**: Next.js 15 App Router, TypeScript, TailwindCSS, shadcn/ui.
- **Backend**: Supabase (auth, Postgres, storage). No dedicated server in this repo.
- **Target**: Responsive web app with listings, product detail, seller interactions, and listing creation.

### Operating Assumptions
- Users authenticate via Supabase.
- Marketplace data is stored in Supabase tables (`products`, `categories`, `users`, etc.).
- Public storage bucket (`product-images`) holds listing images.
- App is typically deployed on Vercel or similar Next.js hosting platforms (see `next.config.ts`).

## 2. Repository Structure
```
src/
  app/
    page.tsx              -> Landing page with category strip + latest listings
    products/             -> Listing index with filters + pagination
    product/[id]/page.tsx -> Product detail, seller info, reviews, similar items
    profile/page.tsx      -> User dashboard (basic)
    sell/                 -> Listing form (client component) + server wrapper
    auth/                 -> Supabase auth callback
  components/
    layout/               -> App shell, header/footer, nav
    products/filter-bar.tsx, product-card-new.tsx, product/similar-items.tsx
    chat/, reviews/       -> UX stubs for messaging & feedback
    ui/                   -> shadcn-generated primitives
  hooks/use-toast.ts      -> Notification helper
  lib/
    services/products.ts  -> Supabase data access layer (queries, mapping)
    database/schema.ts    -> Drizzle schema (reference only; not executed here)
    seed-data.ts          -> Legacy mock data stub
  utils/supabase/         -> SSR/CSR clients & middleware glue
public/ (implicit)        -> Not present; remote images used instead
```

## 3. Application Workflows

### 3.1 Home (`/`)
- Loads featured products + categories.
- Uses `getProducts`/`getCategories` services.
- CTA to `/products` and `/sell`.

### 3.2 Product Index (`/products`)
- Server component accepts filter searchParams.
- Fetches categories + locations (Supabase aggregate).
- `ProductsFilterBar` (client) keeps filters in URL query and triggers router.replace.
- Pagination handled by server component; UI provides prev/next buttons.

### 3.3 Product Detail (`/product/[id]`)
- Server component fetches product with seller/category via `getProductById`.
- Increments view count asynchronously.
- Renders image gallery, seller profile, placeholder review widget, and `SimilarItems` (Suspense).

### 3.4 Listing Creation (`/sell`)
- Server component wraps `SellForm` with authenticated user context.
- `SellForm` (client):
  - Loads categories on mount.
  - Validates required fields (price, condition, location, category, at least one image).
  - Uploads images to Supabase storage bucket (`product-images` by default).
  - Modern drag-and-drop uploader accepts JPG, PNG, WebP, or AVIF up to 10MB each.
  - Upload API (`src/app/api/uploads/route.ts`) uses Supabase service role on the server to persist and delete media safely.
  - Stores public image URLs with product insert.
  - Displays upload progress, preview, and removal (with storage cleanup).
  - Redirects to home on success.

### 3.5 Profile (`/profile`)
- Uses `getProducts` filtered by `sellerId` to present user listings (basic).

## 4. Data & External Services

### 4.1 Supabase Tables (expected schema highlights)
- `products`: price, condition, images (string[]), category_id, seller_id, location, views, timestamps.
- `categories`: name, icon, active flag.
- `users`: contact info, rating metadata.
- Additional tables implied by Drizzle schema (`messages`, `reviews`) but not fully wired.

### 4.2 Storage
- Bucket: `product-images` (configurable with `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`).
- File path pattern: `${userId}/${timestamp-rand}.${ext}`.
- Requires auth role insert/delete policies for authenticated users.

### 4.3 Environment Variables (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=product-images
```
**Security note:** do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser environment. Consider moving it to server-side only contexts or removing.

## 5. Build & Run

```
# install
npm install

# development server
npm run dev  # hosted on 0.0.0.0:5000 per package.json

# linting
npm run lint

# type-check
npm run typecheck

# production build
npm run build && npm run start
```

No automated tests are defined. ESLint and TypeScript checks are the only guards.

## 6. Architectural Notes for Agents
- **Data layer**: `src/lib/services/products.ts` centralizes Supabase queries and mapping helpers (`mapProduct`, `mapCategory`, etc.). Reuse these for any new fetching/updating tasks.
- **Auth**: `createClient` (browser) + `createClient(cookieStore)` (server) handle Supabase sessions using cookies.
- **UI state**: Client components manage local state (`ProductsFilterBar`, `SellForm`). Server components fetch data and pass initial props.
- **Routing**: App Router with streaming (`Suspense`) patterns for long-running fetches (e.g., similar products).
- **Styling**: Tailwind classes with shadcn components. Maintain design consistency by using existing UI primitives.

## 7. Current Gaps & Improvement Opportunities

| Area | Issue | Suggested Action |
|------|-------|------------------|
| Storage config | Bucket policies/config must be set manually. | Add script or checklist; consider runtime verification & user messaging if bucket missing. |
| Error handling | Minimal user feedback for Supabase errors beyond toast; server components may crash on unexpected data. | Add graceful fallbacks, logging, & error boundaries. |
| Data validation | Client-side only; server accepts raw inputs. | Add server-side validation (zod/drizzle) before inserting to Supabase. |
| Reviews & chat | Components use placeholder data. | Wire to real Supabase tables or remove until backend ready. |
| Tests | None. | Introduce unit/integration tests (React Testing Library, Playwright). |
| Accessibility | Need audit for ARIA, keyboard navigation. | Run `@axe-core/react` or Lighthouse accessibility pass. |
| i18n | `next-intl` dependency installed but unused. | Implement locale routing or remove dependency. |
| Performance | Products page fetches categories/locations on each request. | Consider caching (Supabase edge cache, Next.js revalidate). |
| Security | Service role key exposed in `.env.local`. | Remove from public env or load via server-side secret manager. |

## 8. Backlog & Future Enhancements
1. **Listings management** - add edit/delete flows and seller dashboard.
2. **Search improvements** - server-side full-text search, combined filter queries.
3. **Messaging** - real-time chat via Supabase Realtime or external service.
4. **Reviews** - persist reviews and ratings; connect to `reviews` table.
5. **Analytics** - aggregate views, conversions; integrate charts on seller profile.
6. **CI/CD** - lint/typecheck/test pipeline; pre-push hooks.
7. **Design polish** - refine mobile layout, skeleton states, dark-mode testing.

## 9. Agent Playbook
- Always initialize Supabase client in the correct environment (`server.ts` vs `client.ts`).
- Reuse `ProductsFilterValues` and mapping helpers to avoid data drift.
- When touching storage or auth flows, confirm policy coverage in Supabase dashboard.
- Follow Tailwind/shadcn patterns; avoid raw HTML unless necessary.
- Update documentation (this file + root README) when introducing new modules or routes.

## 10. Reference Commands
```
# inspect product service functions
rg "export async function get" src/lib/services/products.ts

# view current routes
fd page.tsx src/app
```

## 11. Contact & Meta
- No official maintainer metadata present; assume PRs reviewed by KU-ONLINE frontend team.
- This document should be kept in sync with significant architectural or workflow changes.

