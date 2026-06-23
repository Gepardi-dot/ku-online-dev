# Secret Rotation Runbook

Last updated: 2026-06-23

## Scope

This runbook covers readiness checks and staged rotation for KU BAZAR runtime secrets. It does not authorize direct production mutation by itself.

Use it for:
- Supabase runtime keys and hook secrets.
- Vercel runtime env secrets.
- Provider secrets for Vonage, Algolia, Sentry, Resend, OpenAI, and PWA operations.
- Operator tokens such as `ADMIN_REVALIDATE_TOKEN`.

Do not use it to rotate database schema, RLS policies, storage policies, OAuth providers, or production data. Those require the normal MCP/Supabase gates and explicit command approval.

## Non-Negotiables

- Never print, paste, commit, or log secret values.
- Rotate preview/staging first when a comparable environment exists.
- Do not rotate production during an active incident unless the incident response owner agrees on rollback criteria.
- Keep the old value available only in the provider secret manager during the verification window.
- Remove old fallback values after verification if the system supports overlap.
- Record what changed, when it changed, and how it was verified.

## Readiness Check

The readiness checker reports presence only. It never prints values.

```bash
npm run security:secrets:readiness
```

For production env review, pull into an ignored local env file first:

```bash
vercel env pull .env.local --yes --environment=production
npm run security:secrets:readiness -- --mode production
```

For command-scoped checks without reading env files:

```bash
npm run security:secrets:readiness -- --mode production --no-env-files
```

Required production gate:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_REVALIDATE_TOKEN`
- Durable rate-limit group:
  - either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  - or `KV_REST_API_URL` + `KV_REST_API_TOKEN`

Recommended production checks:
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`
- Algolia search/indexing group
- Vonage SMS group
- `SUPABASE_SMS_HOOK_SECRET`
- `OPENAI_API_KEY` for translation/embedding maintenance jobs
- PWA alert/push secrets only if those features are enabled

## Rotation Order

1. Confirm the current worktree is clean enough for the operation.
2. Run the relevant MCP gate:
   - deploy/env work: `npm run mcp:auto -- --task deploy --doctor-only --keep-profile`
   - DB/RLS/storage/auth work: `npm run mcp:auto -- --task db --doctor-only --keep-profile`
   - provider/comms work: `npm run mcp:auto -- --task comms --doctor-only --keep-profile`
3. Run `npm run security:secrets:readiness` and record missing items by name only.
4. Rotate in preview/staging first where possible.
5. Redeploy preview/staging if the platform requires redeploy for env changes.
6. Run the variable-specific verification below.
7. Rotate production only after staging verification passes.
8. Redeploy production if required.
9. Run production smoke checks.
10. Watch Vercel logs, Sentry, Supabase logs, and provider dashboards for at least 30 minutes.
11. Remove old fallback values after the overlap window.

## Variable-Specific Verification

| Variable or group | Verification |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `npm run check:env`, homepage browse smoke, sign-in callback smoke where available. |
| `SUPABASE_SERVICE_ROLE_KEY` | Protected `GET /api/internal/health` returns database/storage/rate-limit `ok`; no public health regression. |
| `ADMIN_REVALIDATE_TOKEN` | `GET /api/internal/health` returns `200` with the new bearer token and `401` with no token. Use `https://www.kubazar.net`, not the apex redirect host. |
| Durable rate-limit group | Protected internal health shows `rateLimit.configured=true` and `backend=upstash`. |
| `SUPABASE_SMS_HOOK_SECRET` | Controlled staging SMS hook request succeeds when signed and fails when unsigned. |
| Vonage group | `npm run vonage:status`; controlled staging SMS smoke if SMS auth is enabled. |
| Algolia group | Search smoke and scheduled indexing/synonym workflow logs show provider auth success. |
| `OPENAI_API_KEY` | Product translation/embedding workflow completes without provider auth errors. |
| Sentry variables | Server/client test events or route wrapper events arrive with the intended environment tag. |
| PWA alert/push secrets | `npm run pwa:incident-rehearsal` and governance checks authenticate successfully if PWA alerting is enabled. |
| Resend/partnership variables | Partnership notification smoke if email notification is enabled. |

## Rollback

Preferred rollback is provider-env restore plus redeploy:

1. Restore the previous value from the provider secret manager.
2. Redeploy the affected environment if required.
3. Re-run the same verification command that failed.
4. Document the failed new value by name and provider version only, never by value.
5. Reattempt rotation in staging after the cause is understood.

For `ADMIN_REVALIDATE_TOKEN`, expect old operator scripts to fail immediately after rotation. Update scripts and monitors first, then rotate production.

For `SUPABASE_SERVICE_ROLE_KEY`, rollback must be fast because many privileged server paths depend on it. Do not revoke the old Supabase key until protected health and high-risk service-role route smoke checks pass.

## Production Approval Template

Before production rotation, state:

- Exact env variable or provider secret names.
- Provider/environment affected.
- Whether old/new overlap is supported.
- Exact commands or console action to be performed.
- Expected success signal.
- Rollback value location, by provider label only.
- Validation commands.
- Monitoring window and owner.

## Notes

- No payments, subscriptions, or voucher secrets are part of current production scope.
- Signed-out product browsing is intentional and should not be affected by secret rotation.
- Contact and seller actions remain sign-in gated.
- Product lifecycle cleanup after roughly three months remains intentional; verify scheduled workflow auth separately from web runtime auth.
