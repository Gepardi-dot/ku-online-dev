# PWA Phase 13 Promotion Checklist

Use this checklist to execute a controlled staging-to-production PWA rollout with measurable stop/go gates.

## Inputs

Set these before running commands:

- `STAGING_URL=https://<staging-domain>`
- `PROD_URL=https://<production-domain>`
- `PWA_SLO_ALERT_SECRET=<shared-secret>`

Optional:

- `PWA_PATH_PREFIX=/` (or a high-traffic route prefix)

## 1) Staging Preflight

1. Deploy staging with:
- `NEXT_PUBLIC_PWA_ENABLED=true`
- `NEXT_PUBLIC_PWA_ROLLOUT_PERCENT=10`
- PWA telemetry/alert variables from `docs/pwa-rollout-burn-in-runbook.md`

2. Run one-shot burn-in check:

```bash
npm run pwa:burn-in-check -- --base-url "$STAGING_URL" --alert-secret "$PWA_SLO_ALERT_SECRET" --require-alert-success true
```

3. Run 30-minute live watch (30 samples x 60s):

```bash
npm run pwa:rollout-watch -- \
  --base-url "$STAGING_URL" \
  --alert-secret "$PWA_SLO_ALERT_SECRET" \
  --window-minutes 60 \
  --display-mode all \
  --path-prefix "${PWA_PATH_PREFIX:-/}" \
  --interval-sec 60 \
  --cycles 30 \
  --max-consecutive-fail 2
```

Stop if watch exits non-zero.

## 2) Production Initial Ramp (10%)

1. Promote the same build/config to production with:
- `NEXT_PUBLIC_PWA_ENABLED=true`
- `NEXT_PUBLIC_PWA_ROLLOUT_PERCENT=10`

2. Execute immediate checks:

```bash
npm run pwa:burn-in-check -- --base-url "$PROD_URL" --alert-secret "$PWA_SLO_ALERT_SECRET" --require-alert-success true
```

3. Observe for 60 to 120 minutes:

```bash
npm run pwa:rollout-watch -- \
  --base-url "$PROD_URL" \
  --alert-secret "$PWA_SLO_ALERT_SECRET" \
  --window-minutes 60 \
  --display-mode all \
  --path-prefix "${PWA_PATH_PREFIX:-/}" \
  --interval-sec 60 \
  --cycles 120 \
  --max-consecutive-fail 2
```

## 3) Ramp Sequence

Ramps are only allowed when previous step is stable.

Suggested sequence:

1. `10% -> 25%`
2. `25% -> 50%`
3. `50% -> 100%`

For each step:

1. Update `NEXT_PUBLIC_PWA_ROLLOUT_PERCENT`.
2. Redeploy.
3. Run burn-in check once.
4. Run live watch for at least 30 minutes.
5. Run governance gate:

```bash
npm run pwa:ramp-governance -- \
  --base-url "$PROD_URL" \
  --alert-secret "$PWA_SLO_ALERT_SECRET" \
  --expected-rollout-percent <new_percent>
```

## 4) Stop/Go Criteria

Proceed only if all are true:

1. Burn-in check exits `0`.
2. Live watch exits `0`.
3. No sustained `summary=fail` from `/api/internal/pwa/rollout-status`.
4. No sustained increase in SW registration failures or poor vitals from admin dashboard.

Rollback immediately if:

1. Two or more consecutive fail samples during live watch.
2. Core authenticated user flows regress.
3. Rollout-status endpoint indicates persistent fail severity post-redeploy.

## 5) Rollback

1. Set `NEXT_PUBLIC_PWA_ENABLED=false`.
2. Redeploy production.
3. Re-run:

```bash
npm run pwa:burn-in-check -- --base-url "$PROD_URL" --alert-secret "$PWA_SLO_ALERT_SECRET"
```

4. Document incident timestamps and affected ramp step.
