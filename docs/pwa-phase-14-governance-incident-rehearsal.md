# PWA Phase 14 Governance and Incident Rehearsal

This phase enforces production ramp governance with strict gates and validates rollback readiness through regular rehearsal.

## Goals

1. Automatically block unsafe ramp progression.
2. Escalate quickly when governance breaches occur.
3. Rehearse incident execution so rollback is operationally predictable.

## Governance Gate

Use the governance command for go/no-go checks:

```bash
npm run pwa:ramp-governance -- \
  --base-url "https://<prod-domain>" \
  --alert-secret "<secret>" \
  --expected-rollout-percent 25 \
  --max-alert-count 0 \
  --max-poor-vitals-rate 0.15 \
  --max-sw-failure-rate 0.05 \
  --max-dispatch-failures 0 \
  --require-durable true
```

Result behavior:

- Exit `0`: gate pass/warn (depending on `--fail-on-warn`)
- Exit `1`: gate fail

Primary signals enforced:

1. rollout-status summary severity
2. durable telemetry source expectation
3. alert count ceiling
4. poor vitals rate ceiling
5. service-worker failure rate ceiling
6. failed alert dispatch count
7. rollout percent match (if expected provided)

## Scheduled Governance

Workflow:

- `.github/workflows/pwa-ramp-governance.yml`

Required secrets:

- `PWA_GOVERNANCE_BASE_URL`
- `PWA_SLO_ALERT_SECRET`

Optional threshold secrets:

- `PWA_GOVERNANCE_EXPECTED_ROLLOUT_PERCENT`
- `PWA_GOVERNANCE_MAX_ALERT_COUNT`
- `PWA_GOVERNANCE_MAX_POOR_VITALS_RATE`
- `PWA_GOVERNANCE_MAX_SW_FAILURE_RATE`
- `PWA_GOVERNANCE_MAX_DISPATCH_FAILURES`
- `PWA_GOVERNANCE_FAIL_ON_WARN`

Escalation behavior:

- On governance failure, workflow triggers `POST /api/internal/pwa/slo-alerts?force=true&windowMinutes=60`.

## Incident Rehearsal

Use non-destructive rehearsal command:

```bash
npm run pwa:incident-rehearsal -- \
  --base-url "https://<prod-domain>" \
  --alert-secret "<secret>" \
  --window-minutes 60
```

By default it:

1. verifies internal endpoints reject unauthorized access
2. verifies authorized rollout-status access works
3. writes a drill report artifact to `.tmp/pwa-incident-rehearsal/latest.json`

Optional side-effect probe (explicitly opt in):

```bash
npm run pwa:incident-rehearsal -- \
  --base-url "https://<prod-domain>" \
  --alert-secret "<secret>" \
  --trigger-alert-probe true
```

This may dispatch real alerts and should only be used in planned drills.

## Scheduled Drill Workflow

Workflow:

- `.github/workflows/pwa-incident-rehearsal.yml`

Manual trigger inputs:

- `base_url` (optional override)
- `window_minutes`
- `trigger_alert_probe`

The workflow uploads a drill artifact JSON report for audit.

## Operating Cadence

1. Run governance gate continuously (scheduled workflow).
2. Run incident rehearsal weekly (manual workflow dispatch).
3. Run incident rehearsal after any major PWA config change.
4. Record drill outcomes and action items in the incident tracker.
