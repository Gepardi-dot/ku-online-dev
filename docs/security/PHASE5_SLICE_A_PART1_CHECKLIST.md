# Phase 5 Slice A Part 1 Checklist

Last updated: `2026-02-23`  
Status: `Ready to execute`

## Goal
Create a practical security-operations baseline for dependencies, secrets, and monitoring.

## In Plain Language
- We now move from "code hardening" to "operational hardening."
- This step makes sure old packages and leaked keys do not silently reopen risk.

## Scope
1. Dependency vulnerability baseline and triage.
2. Secret rotation runbook draft (staging first, production second).
3. Monitoring checklist for privileged-route abuse indicators.

## Execution Checklist

### A) Dependency Baseline
1. Generate vulnerability baseline:
   - `npm audit --omit=dev --json > recovery_from_session/security/npm-audit-prod.json`
   - `npm audit --json > recovery_from_session/security/npm-audit-all.json`
2. Build triage summary (critical/high first):
   - package name, affected version, fix version, runtime exposure, decision (`fix now` / `accept temporarily`).
3. Define first remediation batch:
   - only low-risk upgrades first; isolate risky upgrades into follow-up slices.

In practice:
- this tells you exactly which libraries are risky today and what to patch first without breaking the app.

### B) Secret Rotation Runbook (Draft)
1. Create secret inventory matrix:
   - env var name, endpoint/use, owner, rotate frequency, last rotated date, environment coverage.
2. Define staged rotation order:
   - rotate in staging,
   - run verification calls,
   - rotate production,
   - re-verify and monitor.
3. Include rollback notes:
   - old-key fallback window (if allowed),
   - immediate rollback command source/location.

Minimum priority secrets:
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_REVALIDATE_TOKEN`
- `SUPABASE_SMS_HOOK_SECRET`
- `VONAGE_API_SECRET`
- `PWA_SLO_ALERT_SECRET`

In practice:
- if one key leaks, you can rotate it safely in minutes instead of improvising under pressure.

### C) Monitoring Baseline
1. Track route-level spike indicators:
   - unusual increases of `401`, `403`, `429`, `5xx`.
2. Track privileged action indicators:
   - delete/moderation/status-change bursts by actor/IP/route.
3. Define response ownership:
   - who gets alerted,
   - triage SLA,
   - escalation path.

In practice:
- this makes attacks visible early, not after damage is done.

## Acceptance Gate
1. Dependency baseline artifacts exist and are reviewed.
2. Secret rotation runbook draft exists with verification + rollback.
3. Monitoring checklist exists with clear owner and trigger rules.
4. `npm run typecheck` remains green for any touched code/docs workflow.
