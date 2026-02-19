# KU BAZAR Marketplace Frontend

This is a Next.js frontend project for the KU BAZAR marketplace. It features a modern UI with mock data and is designed to work with any backend service.

## Tech Stack

- **Framework**: Next.js (with App Router)
- **UI Components**: ShadCN UI
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Data**: Mock data for demonstration

## Requirements

- **Node.js**: 22.x (see `.node-version` / `.nvmrc`)
- **Package manager**: npm (bundled with Node)

## Local development

- `npm run dev` – start the dev server on port 5000
- `npm run lint` – lint with ESLint (use `npm run lint:ci` for zero warnings)
- `npm run typecheck` – TypeScript type checks
- `npm test` – run the Node test runner
- `npm run build` / `npm run start` – production build and local serve

## PWA setup

The app now includes a browser-installable PWA baseline (manifest, service worker, offline fallback page).

1. Set `NEXT_PUBLIC_PWA_ENABLED=true` to enable service-worker registration.
2. Start controlled rollout with `NEXT_PUBLIC_PWA_ROLLOUT_PERCENT` (for example `10`), then ramp gradually to `100`.
3. Keep `NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED=true` to show in-app install CTA prompts.
4. Set `NEXT_PUBLIC_PWA_PUSH_ENABLED=true` and `NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY=<public-vapid-key>` to enable push subscription prompts.
5. Keep `PWA_VAPID_PRIVATE_KEY=<private-vapid-key>` on the server for push delivery tooling (when delivery endpoints are added).
6. Keep `NEXT_PUBLIC_PWA_TELEMETRY_ENABLED=true` to collect client vitals/lifecycle events and ingest via `/api/pwa/telemetry`.
7. Keep `PWA_TELEMETRY_DURABLE_ENABLED=true` to persist telemetry in Supabase tables and power admin summaries.
8. Set `PWA_SLO_ALERT_WEBHOOK_URL=<https-webhook-endpoint>` and `PWA_SLO_ALERT_SECRET=<strong-shared-secret>` to enable alert dispatch from `/api/internal/pwa/slo-alerts`.
9. Deploy on HTTPS (required for service workers in production).
10. Verify `/manifest.webmanifest`, `/sw.js`, and `/offline.html` respond successfully after deploy.

## Supabase storage setup

Image uploads for product listings rely on a Supabase Storage bucket. The frontend defaults to a bucket named `product-images` (or the value of `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`). Create the bucket once in your Supabase project and make it public-read:

1. Open the [Supabase dashboard](https://supabase.com/dashboard) for your project.
2. Navigate to **Storage → Buckets** and click **New bucket**.
3. Enter `product-images` as the name (or the bucket name you have configured in `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`).
4. Set the bucket to public. Uploads still go through the authenticated `/api/uploads` route and write/delete access remains locked down by policy.
5. (Optional) Set a file size limit and allowed MIME types that suit your marketplace.
6. Save the bucket and apply the policies in `supabase/storage-policies.sql` so anyone can read images and only owners can manage their own files.

After the bucket exists, image uploads from the sell form will succeed. If uploads still fail, double-check the environment variables in `.env.local` for your Supabase URL, anon key, and storage bucket name.

## Supabase database & edge functions

Run the migrations and deploy the edge function so that the frontend can rely on live data instead of mocks:

1. `supabase db reset --env-file .env.local` (or `supabase db push`) to apply the schema, triggers, policies, and the demo seed data.
2. `supabase functions deploy product-search --project-ref <project-ref>` to publish the full-text search edge function. The
   frontend now relies on the function for both listings search and pagination metadata.
3. Verify the following environment variables exist in Vercel/Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`.

### Supabase Auth configuration

- In the Supabase dashboard (Authentication → URL configuration) set:
  - **Site URL** → `http://localhost:5000` for local runs and your production domain (for example `https://KU BAZAR.vercel.app`) in hosted environments.
  - **Redirect URLs** → include `http://localhost:5000/*` for development. Avoid using `0.0.0.0` which browsers reject as an OAuth callback.
  - Add `https://<your-production-domain>/*` to Redirect URLs before shipping.
- Rotate the Google provider credentials if they were created for a different origin, then re-run the OAuth flow to confirm the user record is created with a populated profile.
- To enable SMS OTP sign-in, enable the **Phone** provider (Authentication → Providers) and configure an SMS provider that supports your target countries (Project Settings → Auth → SMS).

### Operations quick reference

```
Local .env.local
  DATABASE_URL
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=product-images
  NEXT_PUBLIC_SITE_URL=http://localhost:5000
  NEXT_PUBLIC_PWA_ENABLED=false
  NEXT_PUBLIC_PWA_ROLLOUT_PERCENT=100
  NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED=true
  NEXT_PUBLIC_PWA_PUSH_ENABLED=false
  NEXT_PUBLIC_PWA_TELEMETRY_ENABLED=true
  NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY=<public-vapid-key>
  PWA_VAPID_PRIVATE_KEY=<private-vapid-key>
  PWA_TELEMETRY_DURABLE_ENABLED=true
  PWA_TELEMETRY_SUMMARY_MAX_ROWS=15000
  PWA_TELEMETRY_RETENTION_DAYS=14
  PWA_SLO_ALERT_WEBHOOK_URL=<https-webhook-endpoint>
  PWA_SLO_ALERT_SECRET=<strong-shared-secret>
  PWA_SLO_ALERT_COOLDOWN_MINUTES=30
  OPENAI_API_KEY=<openai-key-for-embeddings>
  ADMIN_REVALIDATE_TOKEN=<your-admin-revalidate-token>
  ALGOLIA_APP_ID=<algolia-app-id>
  ALGOLIA_SEARCH_API_KEY=<algolia-search-key>
  ALGOLIA_ADMIN_API_KEY=<algolia-admin-key>
  ALGOLIA_INDEX_NAME=<algolia-index-name>
  ALGOLIA_BATCH_SIZE=500

Vercel (Dev/Preview/Prod)
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET
  NEXT_PUBLIC_SITE_URL
  NEXT_PUBLIC_PWA_ENABLED
  NEXT_PUBLIC_PWA_ROLLOUT_PERCENT
  NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED
  NEXT_PUBLIC_PWA_PUSH_ENABLED
  NEXT_PUBLIC_PWA_TELEMETRY_ENABLED
  NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY
  PWA_VAPID_PRIVATE_KEY
  PWA_TELEMETRY_DURABLE_ENABLED
  PWA_TELEMETRY_SUMMARY_MAX_ROWS
  PWA_TELEMETRY_RETENTION_DAYS
  PWA_SLO_ALERT_WEBHOOK_URL
  PWA_SLO_ALERT_SECRET
  PWA_SLO_ALERT_COOLDOWN_MINUTES
  OPENAI_API_KEY
  ADMIN_REVALIDATE_TOKEN
  ALGOLIA_APP_ID
  ALGOLIA_SEARCH_API_KEY
  ALGOLIA_ADMIN_API_KEY
  ALGOLIA_INDEX_NAME
  ALGOLIA_BATCH_SIZE
```

- Purge caches after deploys: `ADMIN_REVALIDATE_TOKEN=... NEXT_PUBLIC_SITE_URL=https://KU BAZAR.vercel.app node tools/revalidate.mjs categories`.
- Rotate Supabase keys via *Project Settings → API*, update `.env.local`, then `vercel env add <NAME> <environment>`.
- Maintain the `product-images` bucket with `node tools/storage-ensure.mjs`; audit RLS using `node tools/audit-supabase.mjs`. The bucket should remain public—reads are anonymous and the app can still use signed URLs when needed.
- Trigger a manual PWA alert check after deployment with:
  `curl -X POST -H "Authorization: Bearer $PWA_SLO_ALERT_SECRET" "$NEXT_PUBLIC_SITE_URL/api/internal/pwa/slo-alerts"`.
- Inspect live rollout status with:
  `curl -H "Authorization: Bearer $PWA_SLO_ALERT_SECRET" "$NEXT_PUBLIC_SITE_URL/api/internal/pwa/rollout-status?windowMinutes=60&dispatchLimit=10"`.
- Admins can also run checks from the moderation dashboard or via
  `POST /api/admin/pwa/slo-alerts/trigger` (auth required, optional JSON body: `windowMinutes`, `displayMode`, `pathPrefix`, `force`).
- Configure GitHub Actions secrets `PWA_SLO_ALERT_RUN_URL` and `PWA_SLO_ALERT_SECRET` to enable `.github/workflows/pwa-slo-alerts.yml`.
- Run the rollout burn-in checker:
  `npm run pwa:burn-in-check -- --base-url "$NEXT_PUBLIC_SITE_URL" --require-alert-success true`.
- Run live rollout observation:
  `npm run pwa:rollout-watch -- --base-url "$NEXT_PUBLIC_SITE_URL" --alert-secret "$PWA_SLO_ALERT_SECRET" --cycles 30`.
- Run strict ramp governance gate:
  `npm run pwa:ramp-governance -- --base-url "$NEXT_PUBLIC_SITE_URL" --alert-secret "$PWA_SLO_ALERT_SECRET" --expected-rollout-percent 25`.
- Run incident rehearsal (non-destructive by default):
  `npm run pwa:incident-rehearsal -- --base-url "$NEXT_PUBLIC_SITE_URL" --alert-secret "$PWA_SLO_ALERT_SECRET"`.
- Report install A/B funnel (shown/CTA/accepted per variant):
  `npm run pwa:install-variant-report -- --base-url "$NEXT_PUBLIC_SITE_URL" --alert-secret "$PWA_SLO_ALERT_SECRET" --window-minutes 1440`.
- Configure GitHub Actions secrets `PWA_BURN_IN_BASE_URL`, `PWA_SLO_ALERT_SECRET`, and optional `PWA_BURN_IN_REQUIRE_ALERT_SUCCESS` to enable `.github/workflows/pwa-burn-in-monitor.yml`.
- Configure GitHub Actions secrets `PWA_GOVERNANCE_BASE_URL` and `PWA_SLO_ALERT_SECRET` to enable `.github/workflows/pwa-ramp-governance.yml`.
- Use `.github/workflows/pwa-incident-rehearsal.yml` for manual drill runs and artifacted rehearsal reports.
- Follow the full rollout/rollback playbook in `docs/pwa-rollout-burn-in-runbook.md`.
- Use the staged promotion execution sheet in `docs/pwa-phase-13-promotion-checklist.md`.
- Use the governance/drill procedure in `docs/pwa-phase-14-governance-incident-rehearsal.md`.

### What the migration enables

- Marketplace tables: `users`, `categories`, `products`, `conversations`, `messages`, `reviews`, `favorites`, and `notifications`.
- RLS policies for buyers/sellers, along with helper RPCs like `get_or_create_conversation` and `search_products`.
- Automatic rating recalculation, conversation metadata updates, and message notifications via Postgres triggers.
- Generated `search_document` column and supporting indexes for fast filtering and fuzzy searches.

### Using the `product-search` edge function

The edge function wraps the `search_products` RPC for richer search results. Invoke it from the client with:

```ts
const { data, error } = await supabase.functions.invoke('product-search', {
  body: {
    query: 'iphone',
    categoryId: 'uuid',
    minPrice: 100000,
    maxPrice: 500000,
    city: 'Erbil',
    limit: 24,
    offset: 0,
  },
});
```

The response includes `{ items, limit, offset, totalCount }`, where `items` mirrors the `products` rows along with a `rank`
column for relevance scoring and `totalCount` reports how many listings match the query.

### Server-side search integration

- The homepage and `/products` route call a new `searchProducts` helper that invokes the edge function when a search query is
  provided, falling back to `getProducts` for empty queries.
- Pagination is preserved by forwarding the `limit`/`offset` values to the edge function and consuming the returned
  `totalCount`.
- Server-side normalization now hydrates seller/category relations for search results so UI components receive
  `ProductWithRelations` objects regardless of the data source.

### Algolia search (optional)

If Algolia is configured, the server-side search helper uses it before falling back to the Supabase edge function.

1. Create an Algolia app + index.
2. Set `ALGOLIA_APP_ID`, `ALGOLIA_SEARCH_API_KEY`, `ALGOLIA_ADMIN_API_KEY`, and `ALGOLIA_INDEX_NAME` in your environment.
3. Index products: `node scripts/index-algolia-products.mjs` (add `--clear` to rebuild from scratch).
4. Listing create/edit/sold/moderation actions call `/api/search/algolia-sync` to keep the index up to date.
5. Sync category synonyms (and optional brand synonyms): `node scripts/algolia-sync-synonyms.mjs`.

### Smart recommendations and semantic search

- The `20241205163000_add_product_embeddings.sql` migration enables the `vector` extension, adds a `products.embedding` column,
  and registers the `recommend_products` RPC that blends cosine similarity with category, price, and engagement filters.
- Deploy `supabase/functions/recommend-products` (via `supabase functions deploy recommend-products --project-ref <project-ref>`) so the backend can serve cached recommendations without exposing the service role key to the client.
- Populate embeddings with `node scripts/backfill-product-embeddings.mjs` (requires `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`). Re-run it whenever bulk imports happen or wire it into your ingestion pipeline so both recommendations
  and search results have up-to-date vectors.
- The `20251210120000_semantic_product_search.sql` migration adds a `search_products_semantic` RPC that blends semantic similarity
  from embeddings with traditional full-text ranking.
- Once vectors exist, product pages automatically render the "Recommended for You" carousel powered by the new RPC, and the
  `product-search` edge function can augment keyword search with multilingual semantic matching. If no embeddings are available yet
  or the OpenAI API key is missing, the UI falls back to simple category-based suggestions and text-only search.

### Smoke tests

Run `npm test` to compile the test bundle and execute smoke tests with Node's built-in runner. The tests stub the Supabase
server client and `product-search` edge response to validate the integration without requiring a live Supabase instance.

## Committing and pushing changes

If you are developing locally and want to publish updates to the default branch (commonly named `main`), run the following commands from the project root:

```bash
# review the staged files before committing
git status

# add the files you have modified
git add <file1> <file2>

# create a descriptive commit message
git commit -m "feat: summarize the change here"

# send your commit to the remote repository
git push origin main
```

Replace `<file1> <file2>` with the paths you modified and tailor the commit message to the work you completed. If your local branch name is not `main`, update the final `git push` command to match it (for example, `git push origin my-branch`).

## Features

- Modern, responsive marketplace UI
- Product browsing and filtering
- Category navigation
- Mobile-friendly design
- Dark/light theme support
- Mock data for demonstration purposes

