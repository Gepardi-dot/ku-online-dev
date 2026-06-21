# Phase 5 Slice A Part 1 Baseline

Last updated: `2026-06-20`

## Goal
Create an operations-grade baseline for dependency risk, secret rotation, and privileged-route monitoring.

This slice also applied the lowest-risk dependency remediation batch that stayed inside existing major version lines and did not touch Supabase schema, RLS, storage, provider config, or production data.

## Dependency Baseline

Artifacts:
- `recovery_from_session/security/npm-audit-prod.json`
- `recovery_from_session/security/npm-audit-all.json`

Initial audit before remediation:
- Production audit: 15 advisories, 0 critical, 4 high, 9 moderate, 2 low.
- Full audit: 73 advisories, 0 critical, 30 high, 40 moderate, 3 low.

Remediation applied in this slice:
- Updated direct runtime/tooling packages within the current major line:
  - `next` to `^16.2.9`
  - `eslint-config-next` to `^16.2.9`
  - `@sentry/nextjs` to `^10.59.0`
  - `next-intl` to `^4.13.0`
  - `postcss` to `^8.5.15`
  - `@supabase/supabase-js` to `^2.108.2`
  - `@supabase/ssr` to `^0.10.3`
- Added npm overrides for patched transitive versions:
  - `fast-uri`: `3.1.2`
  - `picomatch`: `4.0.4`
  - `ws`: `8.21.0`

Final audit after remediation and npm 10 lockfile normalization:
- Production audit: 6 advisories, 0 critical, 0 high, 5 moderate, 1 low.
- Full audit: 64 advisories, 0 critical, 26 high, 36 moderate, 2 low.

Triage decisions:

| Area | Runtime exposure | Decision |
| --- | --- | --- |
| Production high advisories | Removed in this slice. | Fixed now. |
| `next` moderate advisory | Direct runtime dependency remains reported by npm audit after `16.2.9`; npm's suggested fix points backward to `9.3.3`, which is not a valid modern remediation path. | Accept temporarily; monitor Next releases and reassess after the next stable patch/canary guidance. |
| `vercel` CLI high advisories | Dev/deploy tooling dependency, not bundled into the user-facing app runtime. | Resolved in Candidate K by removing the repo-pinned `vercel` devDependency and keeping Vercel CLI as external operator tooling. |
| Remaining full-audit high advisories under Vercel CLI transitive tree | Local/deploy tooling path. | Resolved in Candidate K; full `npm audit --audit-level=high` now passes with 0 high/critical advisories. |

## Secret Rotation Runbook Draft

No secrets were printed, committed, or rotated in this slice.

Minimum rotation inventory:

| Secret | Primary use | Environments | Rotation owner | Suggested frequency |
| --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged DB/storage/auth operations. | Local, preview/staging if configured, production. | Project owner / database operator. | At least quarterly and immediately after suspected exposure. |
| `ADMIN_REVALIDATE_TOKEN` | Internal health/revalidate/legacy token-protected admin automation. | Local, preview/staging if configured, production. | Project owner / deploy operator. | At least quarterly and after any operator/device exposure. |
| `SUPABASE_SMS_HOOK_SECRET` | SMS auth hook verification. | Local, preview/staging if configured, production. | Project owner / auth operator. | At least quarterly and after provider/auth changes. |
| `VONAGE_API_SECRET` | Vonage SMS/provider calls and webhook workflows. | Local, preview/staging if configured, production. | Project owner / provider operator. | At least quarterly and after provider-console access changes. |
| `PWA_SLO_ALERT_SECRET` | Internal PWA SLO/governance endpoints. | Local, preview/staging if configured, production. | Project owner / operations operator. | At least quarterly and after monitoring access changes. |

Staged rotation order:
1. Confirm MCP/profile readiness for provider, deploy, or DB work if the rotation touches those systems.
2. Rotate in staging/preview first where available.
3. Run the endpoint-specific verification listed below.
4. Rotate production only after staging verification passes.
5. Redeploy production if the provider does not hot-inject env changes.
6. Run production verification and watch logs/alerts for at least 30 minutes.
7. Remove any old fallback secret after the agreed overlap window.

Verification checklist:
- `SUPABASE_SERVICE_ROLE_KEY`: protected internal health returns database/storage `ok`; admin service-role routes still perform a read-only smoke where possible.
- `ADMIN_REVALIDATE_TOKEN`: `/api/internal/health` returns HTTP 200 only with the new bearer token and HTTP 401 with no token.
- `SUPABASE_SMS_HOOK_SECRET`: SMS auth hook sends/validates a controlled test request in staging first.
- `VONAGE_API_SECRET`: Vonage status command and one controlled SMS/provider smoke pass in staging first.
- `PWA_SLO_ALERT_SECRET`: PWA incident rehearsal and governance scripts authenticate successfully.

Rollback notes:
- Prefer short dual-secret overlap only when the endpoint supports it. Current routes mostly support one active secret, so rollback usually means restoring the previous Vercel env value and redeploying.
- Keep old values only in the provider/secret manager long enough to verify the new value. Do not commit old or new values.
- If a production rotation breaks user-facing auth/SMS, restore the previous value, redeploy, verify, then reattempt in staging.

## Monitoring Baseline

Privileged routes to monitor first:
- `/api/admin/*`
- `/api/abuse/report/manage`
- `/api/admin/users/verify`
- `/api/products/:id` delete/moderation paths
- `/api/products/:id/sold`
- `/api/products/translate`
- `/api/account/delete`
- `/api/uploads`
- `/api/uploads/sign`
- `/api/internal/health`
- `/api/internal/pwa/*`
- `/api/auth/send-sms`
- `/api/vonage/webhook`
- `/api/sponsors/*`

Minimum alert indicators:
- Spike in `401` on privileged routes: possible credential probing or expired/rotated secret mismatch.
- Spike in `403`: possible cross-origin attempts, role probing, or compromised non-privileged session.
- Spike in `429`: abuse automation or malfunctioning client/job.
- Spike in `5xx`: provider outage, service-role breakage, schema drift, or bad deployment.
- Burst of successful privileged mutations by one actor/IP: possible compromised admin/moderator/session.

Initial thresholds for controlled beta:
- `401` or `403`: alert if more than 20 events on privileged routes in 10 minutes from one IP or more than 50 total in 10 minutes.
- `429`: alert if more than 10 events in 10 minutes for one actor/IP/route.
- `5xx`: alert on any sustained privileged-route error rate above 5% for 5 minutes.
- Successful privileged mutations: alert if one actor performs more than 10 moderation/status/delete/verification actions in 10 minutes.

Owner and response:
- Primary owner: project owner/operator.
- Triage SLA: same day for beta, within 30 minutes once public launch traffic begins.
- First response: identify route, actor/user ID, IP, status mix, recent deploy, and provider status.
- Escalation: rotate affected secrets or suspend affected privileged account if abuse is plausible.

## Acceptance
- Dependency audit artifacts exist and parse as JSON.
- Production high advisories are removed from `npm audit --omit=dev`.
- Full-audit high advisories are removed after Candidate K validation and production deployment.
- The GitHub Actions installer path is reproducible with `npx npm@10.9.4 ci --ignore-scripts`.
- Secret rotation and monitoring baselines are documented without exposing secrets.
- Runtime dependency changes require full typecheck, lint, tests, build, and production smoke after deployment.
