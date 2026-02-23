# Phase 4 Closeout Residual Risks

Last updated: `2026-02-23`  
Scope: Required-now service-role routes listed in `docs/security/SERVICE_ROLE_INVENTORY.md`.

## Purpose
Document what risk still exists after Phase 4 hardening, and what Phase 5 must reduce next.

## In Plain Language
- We removed many avoidable privileged paths.
- Some endpoints still need admin-level power by design.
- Those endpoints are harder to abuse now, but not risk-free.
- Phase 5 focuses on secrets, dependencies, and monitoring so these remaining powerful paths are safer to operate.

## Residual Risk Register

### 1) Privileged account/session compromise
Applies to:
- `src/app/api/products/[id]/route.ts`
- `src/app/api/products/[id]/sold/route.ts`
- `src/app/api/products/translate/route.ts`
- `src/app/api/account/delete/route.ts`
- `src/app/api/admin/users/verify/route.ts`
- `src/app/api/abuse/report/manage/route.ts`
- `src/app/api/admin/**`
- `src/app/api/sponsors/**` admin/staff mutation routes

What abuse looks like in practice:
- attacker gets moderator/admin session and performs legitimate-but-harmful privileged actions.

Current controls:
- auth checks, origin checks, IP/principal throttles, input validation, safer error output.

Residual risk:
- if a real privileged identity is compromised, authorization still permits high-impact actions.

Phase 5 action:
- add monitoring and alert thresholds for privileged endpoints and suspicious action bursts.

### 2) Secret/token compromise on internal or webhook paths
Applies to:
- `src/app/api/auth/send-sms/route.ts`
- `src/app/api/vonage/webhook/route.ts`
- `src/app/api/internal/health/route.ts`
- `src/app/api/internal/pwa/rollout-status/route.ts`
- token-based admin routes (`admin/moderate`, `admin/announcements`)

What abuse looks like in practice:
- leaked secret allows attacker to call protected routes as if they are trusted automation.

Current controls:
- signature/token checks, origin guard, throttles, production fail-closed checks.

Residual risk:
- stale or leaked secrets can still bypass normal user auth boundaries.

Phase 5 action:
- perform staged secret rotation and add post-rotation verification checklist.

### 3) Dependency-level exploit path
Applies to:
- server/runtime and library supply chain across API routes.

What abuse looks like in practice:
- vulnerable package gives attacker a bypass or remote execution path.

Current controls:
- no dedicated triage artifact yet in this phase.

Residual risk:
- unknown critical/high CVEs may exist until triage is completed.

Phase 5 action:
- produce dependency baseline and explicit fix/accept decisions by severity.

### 4) Detection blind spots
Applies to:
- all required-now privileged routes.

What abuse looks like in practice:
- abuse attempts happen, but are only visible in ad-hoc logs and missed operationally.

Current controls:
- route logs and response safeguards exist in many routes.

Residual risk:
- no unified alert policy for spikes in `401`, `403`, `429`, and privileged mutations.

Phase 5 action:
- define metrics/alerts and response ownership for security-relevant API events.

## Closeout Statement
Phase 4 achieved its main goal: privileged data paths are now tighter and many replaceable service-role paths were removed.
The remaining risk is mostly operational (credential/secret/dependency/monitoring), which is the focus of Phase 5.
