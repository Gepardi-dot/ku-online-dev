# PWA Rollout and Burn-in Runbook

This runbook defines the execution path for enabling the PWA stack in staging/production and monitoring the first burn-in window.

## Scope

- Browser installability
- Service worker delivery and update behavior
- Push subscription surface
- Telemetry durability and SLO alert dispatch
- Rollback conditions and rollback procedure

## Required Environment Configuration

Set these before enabling rollout:

- `NEXT_PUBLIC_PWA_ENABLED=true`
- `NEXT_PUBLIC_PWA_ROLLOUT_PERCENT=10` (initial production ramp recommendation)
- `NEXT_PUBLIC_PWA_INSTALL_UI_ENABLED=true`
- `NEXT_PUBLIC_PWA_PUSH_ENABLED=true` (or `false` if push is not in initial rollout)
- `NEXT_PUBLIC_PWA_TELEMETRY_ENABLED=true`
- `NEXT_PUBLIC_PWA_VAPID_PUBLIC_KEY=<public_key>`
- `PWA_VAPID_PRIVATE_KEY=<private_key>`
- `PWA_TELEMETRY_DURABLE_ENABLED=true`
- `PWA_TELEMETRY_SUMMARY_MAX_ROWS=15000`
- `PWA_TELEMETRY_RETENTION_DAYS=14`
- `PWA_SLO_ALERT_WEBHOOK_URL=<webhook_url>`
- `PWA_SLO_ALERT_SECRET=<strong_secret>`
- `PWA_SLO_ALERT_COOLDOWN_MINUTES=30`

Burn-in monitor workflow secrets:

- `PWA_BURN_IN_BASE_URL=<https://your-domain>`
- `PWA_SLO_ALERT_SECRET=<same as app secret>`
- `PWA_BURN_IN_REQUIRE_ALERT_SUCCESS=true` (recommended for production)

## Staging Rollout Checklist

1. Deploy with PWA flags enabled in staging.
2. Verify installability endpoints:
- `GET /manifest.webmanifest`
- `HEAD /sw.js`
- `GET /offline.html`
3. Verify telemetry ingestion:
- `POST /api/pwa/telemetry` with one `pwa_lifecycle` event.
4. Verify durable telemetry summary:
- Open moderation dashboard and confirm source shows `durable`.
5. Verify alert route security:
- `GET /api/internal/pwa/slo-alerts` without secret returns `401` or `503`.
6. Verify authenticated alert execution:
- `POST /api/internal/pwa/slo-alerts` with bearer secret returns `200` (or expected config error during setup).
7. Verify scheduled automation:
- Confirm `.github/workflows/pwa-slo-alerts.yml` and `.github/workflows/pwa-burn-in-monitor.yml` run successfully.

## Production Rollout Checklist

1. Promote the same config validated in staging.
2. Start with `NEXT_PUBLIC_PWA_ROLLOUT_PERCENT=10` (or lower for high-risk windows).
3. Run `npm run pwa:burn-in-check -- --base-url https://<prod-domain> --require-alert-success true`.
4. Trigger one manual alert check:
- `curl -X POST -H "Authorization: Bearer $PWA_SLO_ALERT_SECRET" "https://<prod-domain>/api/internal/pwa/slo-alerts"`.
5. Inspect live rollout status:
- `curl -H "Authorization: Bearer $PWA_SLO_ALERT_SECRET" "https://<prod-domain>/api/internal/pwa/rollout-status?windowMinutes=60&dispatchLimit=10"`.
6. Confirm moderation dashboard loads with telemetry data and no auth regressions.
7. Confirm no spike in service-worker registration failures from dashboard SLO card.
8. Ramp rollout percent in controlled steps (example: `10 -> 25 -> 50 -> 100`) only after each step stabilizes.

## Burn-in Monitoring Window

Recommended initial burn-in window: first 24 hours after production rollout.

Operational cadence:

1. First hour: observe every 10 to 15 minutes.
2. Next 5 hours: observe every 30 minutes.
3. Remaining 18 hours: observe hourly.

Primary indicators:

- SW registration failure rate
- Poor web-vitals rate
- Install accept rate
- Push enable rate
- Alert dispatch failures in `pwa_slo_alert_dispatches`

Use:

- Moderation dashboard PWA card
- `npm run pwa:burn-in-check`
- `npm run pwa:rollout-watch`
- `npm run pwa:ramp-governance`
- Workflow run history for burn-in and SLO alerts

Phase 13 execution checklist:

- `docs/pwa-phase-13-promotion-checklist.md`

Phase 14 governance and incident rehearsal:

- `docs/pwa-phase-14-governance-incident-rehearsal.md`

## Rollback Triggers

Trigger rollback if any of these persist for more than two consecutive windows:

1. SW registration failure rate breaches SLO with fail severity.
2. Critical routes fail due to caching/session regression.
3. Internal alert route repeatedly fails due to infrastructure issues.
4. Installability assets fail to serve in production.

## Rollback Procedure

1. Set `NEXT_PUBLIC_PWA_ENABLED=false`.
2. Redeploy production.
3. Keep telemetry and alerting enabled to observe post-rollback stabilization.
4. Re-run burn-in checker to confirm manifest/SW behavior now matches disabled state expectations.
5. Open incident record with timestamps, failing indicators, and corrective actions.

## Exit Criteria for Burn-in Completion

Burn-in is complete when all are true for at least 24 hours:

1. No persistent fail-severity SLO alerts.
2. Burn-in monitor workflow is consistently green.
3. Manual spot checks on installability and auth flows pass.
4. No user-facing regressions reported for navigation, sign-in, or core marketplace flows.
