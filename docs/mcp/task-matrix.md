# MCP Task Matrix

Use this matrix before implementation to pick the MCP profile and enforcement behavior.

| Task type | Example actions | Profile | Gate |
| --- | --- | --- | --- |
| Local UI and low-risk refactors | Styling, component cleanup, copy changes | `minimal` | Soft |
| General Supabase/Vercel context read | Inspect DB metadata, inspect deployment metadata | `core` | Soft |
| DB schema/RLS/auth/storage changes | Migrations, policy edits, storage policy work | `db-admin` | Hard |
| Deployment and production diagnostics | Vercel env checks, preview/prod health debugging | `deploy` | Hard |
| External provider operations | Vonage messaging or telephony tooling actions | `comms` | Hard |

## Gate definitions
- Hard: run `npm run mcp:doctor -- --profile <profile>` and resolve blockers before execution.
- Soft: MCP is recommended. If unavailable, proceed only with explicit warning and fallback rationale.

## Standard flow
1. Prefer autopilot: `npm run mcp:auto -- --task <ui|core|db|deploy|comms>`
2. If blocked, resolve checklist blockers and rerun.
3. Execute task (or pass the command directly to autopilot).
4. Autopilot resets profile after command execution by default.

Manual fallback:
1. Activate profile: `npm run mcp:profile -- activate <profile>`
2. Run doctor: `npm run mcp:doctor -- --profile <profile> --emit-checklist`
3. Resolve checklist blockers if any.
4. Execute task.
5. Reset profile: `npm run mcp:off`
