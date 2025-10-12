# KU-ONLINE Marketplace Frontend

This is a Next.js frontend project for the KU-ONLINE marketplace. It features a modern UI with mock data and is designed to work with any backend service.

## Tech Stack

- **Framework**: Next.js (with App Router)
- **UI Components**: ShadCN UI
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Data**: Mock data for demonstration

## Supabase storage setup

Image uploads for product listings rely on a Supabase Storage bucket. The frontend defaults to a bucket named `product-images` (or the value of `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`). Create the bucket once in your Supabase project and ensure it is public:

1. Open the [Supabase dashboard](https://supabase.com/dashboard) for your project.
2. Navigate to **Storage → Buckets** and click **New bucket**.
3. Enter `product-images` as the name (or the bucket name you have configured in `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`).
4. Enable **Public bucket** so that listing photos can be displayed without authentication.
5. (Optional) Set a file size limit and allowed MIME types that suit your marketplace.
6. Save the bucket and, if required, add [Storage policies](https://supabase.com/docs/guides/storage#policies) that allow authenticated users to upload objects.

After the bucket exists, image uploads from the sell form will succeed. If uploads still fail, double-check the environment variables in `.env.local` for your Supabase URL, anon key, and storage bucket name.

## Supabase database & edge functions

Run the migrations and deploy the edge function so that the frontend can rely on live data instead of mocks:

1. `supabase db reset --env-file .env.local` (or `supabase db push`) to apply the schema, triggers, policies, and the demo seed data.
2. `supabase functions deploy product-search --project-ref <project-ref>` to publish the full-text search edge function.
3. Verify the following environment variables exist in Vercel/Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`.

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

The response includes `{ items, limit, offset }`, where `items` mirrors the `products` rows along with a `rank` column for relevance scoring.

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
