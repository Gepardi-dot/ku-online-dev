# MCP Orchestration

This repository uses a profile-based MCP workflow so agents can acquire the right MCP servers only when they are high-value for the task.

## Source of truth
- `tools/mcp/profiles.json` defines MCP servers and profile membership.
- `tools/mcp/requirements.json` defines readiness checks and setup guidance.
- `.cursor/mcp.json` is generated from profile state (`npm run mcp:profile -- activate <profile>`).

## Profiles
- `minimal` (default): high-value MCPs off.
- `core`: Supabase (read mode) + Vercel.
- `db-admin`: Supabase write mode + Vercel, with optional remote Supabase MCP when `SUPABASE_ACCESS_TOKEN` is present.
- `deploy`: Vercel-focused deployment diagnostics.
- `comms`: Vonage-focused provider operations.

`github` and `context7` are marked external in profile contracts and should be configured in user-level MCP config when needed.

## Commands
```bash
npm run mcp:auto -- --task core
npm run mcp:auto -- --task db -- node tools/scripts/supabase-parity-report.mjs --prod-ref <ref> --staging-ref <ref>
npm run mcp:profile -- list
npm run mcp:profile -- activate core
npm run mcp:status
npm run mcp:doctor -- --profile core --emit-checklist
npm run mcp:off
```

Preset shortcuts (doctor + keep profile):
```bash
npm run mcp:auto:core
npm run mcp:auto:db
npm run mcp:auto:deploy
npm run mcp:auto:comms
```

Supabase npm scripts are already wrapped with `mcp:auto --task db`, so running
`npm run supabase:parity|supabase:sql|supabase:admin:grant|supabase:apply|supabase:policies`
automatically enforces MCP profile activation + doctor gating.

Windsurf to Cursor sync (one-time or repeatable):
```bash
npm run mcp:sync:windsurf
```
This imports enabled servers from `~/.codeium/windsurf/mcp_config.json` into `.cursor/mcp.json` and strips sensitive inline header tokens from tracked config.

Automatic baseline ensure (recommended for agents):
```bash
npm run mcp:ensure
```
This no-ops when Cursor already has all enabled Windsurf servers; otherwise it auto-runs sync.

Optional Codex user-level bootstrap:
```bash
# dry run
npm run mcp:bootstrap:codex -- --profile core

# apply to ~/.codex/mcp.json
npm run mcp:bootstrap:codex -- --profile core --apply
```

## Risk-gated behavior
- High-risk operations (DB/auth/storage/deploy/provider actions) must pass `mcp:doctor` before execution.
- Low-risk tasks may continue without MCP, but the agent should state fallback risk explicitly.

See `docs/mcp/task-matrix.md` for profile selection and gate level.

## Setup references
- General setup checklist: `docs/mcp/setup-checklist.md`
- Vonage-specific setup: `docs/mcp/vonage-tooling.md`
