# MCP Setup Checklist

Use this checklist when `npm run mcp:doctor` reports missing prerequisites.

## Core profile prerequisites (`core`)
### Supabase local MCP (`supabase-local`)
- Install Supabase CLI.
- Install/start Docker Desktop.
- Start local Supabase in repo root: `supabase start`.
- Set in `.env.local`:
  - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Optional for anon reads: `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Vercel MCP (`vercel`)
- Install Vercel CLI.
- Authenticate with `vercel login`.
- Confirm with `vercel whoami`.

## DB admin optional remote Supabase (`supabase-remote`)
- Create a Supabase personal access token.
- Set `SUPABASE_ACCESS_TOKEN` in secure user-level environment settings.
- Re-run:
  - `npm run mcp:profile -- activate db-admin`
  - `npm run mcp:doctor -- --profile db-admin`

## Comms profile prerequisites (`comms`)
- Set in `.env.local`:
  - `VONAGE_API_KEY`
  - `VONAGE_API_SECRET`
  - `VONAGE_APPLICATION_ID`
  - `VONAGE_PRIVATE_KEY64`
  - `VONAGE_VIRTUAL_NUMBER`
- Validate: `npm run vonage:status`

## Optional integrations (external/user-level MCP config)
- GitHub MCP:
  - Set `GITHUB_MCP_PAT` (or `GITHUB_TOKEN`/`GH_TOKEN`) in secure user-level env.
  - Configure GitHub MCP server in user-level client config.
- Context7 MCP:
  - Set `CONTEXT7_API_KEY` in secure user-level env.
  - Configure Context7 MCP server in user-level client config.
- Playwright MCP:
  - Ensure Node.js/npm available so `npx` works.

## Security rules
- Never commit secrets to tracked files.
- Keep secrets in `.env.local` or user-level secure config only.
- Treat `.cursor/mcp.json` as generated, secret-free config.
