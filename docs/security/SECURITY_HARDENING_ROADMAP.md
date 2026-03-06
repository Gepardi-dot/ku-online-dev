# Security Hardening Roadmap

## Goal
Harden the app in controlled phases, with each phase scoped, implemented, and validated before starting the next phase.

## Execution Rules
- Only one active phase at a time.
- Each phase ends with explicit verification (`eslint`, `typecheck`, and targeted runtime checks).
- No schema/policy production pushes without explicit user instruction.
- Keep a running log in `docs/security/SECURITY_PHASE_NOTES.md`.

## Phase Overview

### Phase 1: Critical Exploitable Surface (Completed)
Scope:
- External webhook verification.
- Object deletion authorization checks.
- Costly unauthenticated API controls.
- Immediate XSS sink hardening.

Success criteria:
- Webhooks fail closed when signature checks fail.
- Users cannot delete files they do not own.
- Expensive translation endpoint requires auth + rate limit.
- JSON-LD sink safely serializes content.

### Phase 2: Admin/Internal Endpoint Hardening (Completed)
Scope:
- Harden token-only admin endpoints.
- Add origin/rate limits where missing.
- Reduce sensitive error leakage.

Success criteria:
- Admin/internal routes have layered controls (authn + origin + rate + input validation).
- Public health endpoints do not leak internals.

### Phase 3: Browser-Side Blast Radius Reduction (Completed)
Scope:
- CSP rollout strategy (report-only first).
- Cookie/session/XSS impact reductions.
- Review all `dangerouslySetInnerHTML` sinks.

Success criteria:
- CSP report-only with no critical breakage.
- High-risk sinks are escaped or removed.

### Phase 4: Data-Layer Access Minimization (Completed Locally)
Scope:
- Minimize service-role use in app routes/pages.
- Enforce least-privilege data access paths.
- Validate privacy-sensitive fields exposure.

Success criteria:
- Service-role access only where strictly required.
- No unnecessary sensitive data exposure paths.
- Closeout residual-risk register documented for remaining by-design privileged routes.

### Phase 5: Dependency + Secrets + Monitoring (Planned - Next)
Scope:
- Dependency vulnerability triage and pinned remediation plan.
- Secret rotation plan for webhook/admin tokens.
- Security telemetry and alerting checks.

Success criteria:
- Vulnerability list triaged with explicit accept/fix decisions.
- Rotation runbook documented and tested.

### Phase 6: Verification & Regression Defense (Planned)
Scope:
- Security regression checklist for PRs.
- Targeted abuse tests.
- Final hardening review.

Success criteria:
- Repeatable security checklist integrated into normal delivery flow.

## Definition of Done Per Phase
- Code changes complete and scoped to the phase.
- `npx eslint` passes for touched files.
- `npm run typecheck` passes.
- Notes updated in `docs/security/SECURITY_PHASE_NOTES.md`.
- Next phase plan is documented before implementation starts.
