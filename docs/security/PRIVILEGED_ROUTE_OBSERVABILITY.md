# Privileged Route Observability

Last updated: 2026-06-22

This runbook covers operational signals for high-risk admin and internal routes. Candidate N adds code-level structured logs only; provider-side alert rules are intentionally not mutated in this slice.

## Instrumented Routes

- `POST /api/admin/moderate`
- `POST /api/admin/announcements`
- `POST /api/admin/revalidate`
- `GET /api/internal/health`

## Event Shape

Search production logs for:

```text
[privileged-route]
```

The payload includes:

- `route`
- `method`
- `event`
- `outcome`
- `status`
- `timestamp`
- `request.clientHash`
- `request.host`
- `request.origin`
- `request.requestId`
- `request.userAgentFamily`
- `reason`
- `retryAfter`
- `subject`

The helper must not log:

- raw IP addresses
- authorization headers
- cookies
- admin tokens
- API keys
- secrets
- announcement titles or bodies
- raw request bodies

## Events

- `forbidden_origin`: request origin failed allow-list checks.
- `forbidden_host`: host was not accepted for revalidation.
- `unauthorized`: token was missing or invalid.
- `rate_limited`: IP or token limiter rejected the request.
- `mutation_succeeded`: privileged mutation completed.
- `mutation_failed`: privileged mutation failed.
- `misconfigured`: required runtime secret/config was absent.
- `diagnostics_failed`: protected internal health returned an unhealthy status.

## Alert Thresholds

Use these thresholds when configuring Sentry, Vercel log drains, or another alerting provider:

- Any `misconfigured` event: urgent investigation.
- Any `diagnostics_failed` event: investigate immediately; page if repeated twice within 10 minutes.
- More than 5 `unauthorized` events for the same `route` and `clientHash` within 10 minutes: likely probing or stale operator secret.
- More than 20 `unauthorized` events across privileged routes within 10 minutes: possible credential attack.
- Any repeated `forbidden_host` on `admin/revalidate`: investigate operator endpoint configuration.
- More than 10 `forbidden_origin` events within 10 minutes: investigate cross-site probing or broken trusted origin config.
- More than 5 `rate_limited` events for the same `route` and `clientHash` within 10 minutes: likely automation or accidental retry loop.
- More than 10 `mutation_succeeded` events on `admin/moderate`, `admin/announcements`, or `admin/revalidate` within 10 minutes outside a planned operation: review operator activity.
- Any `mutation_failed` event: review route logs and downstream provider health.

## Handling

1. Confirm the route, event, status, and request id.
2. Group by `clientHash` and route to separate one noisy caller from a broad attack.
3. Check nearby `401`, `403`, and `429` rates.
4. For mutation events, confirm whether the action was expected operational work.
5. For `internal/health`, compare database, storage, and rate-limit check statuses.
6. Rotate `ADMIN_REVALIDATE_TOKEN` if there is evidence of token exposure or unexplained successful privileged mutations.

## Operator Notes

- Use `https://www.kubazar.net` for Bearer-token checks. The apex host redirects to `www`, and cross-host redirects can drop the `Authorization` header.
- `x-admin-token` remains supported for legacy operator tooling.
- Do not lower rate limits to hide alerts. Fix the cause or explicitly document the operational exception.
