---
name: mcp-acquisition
description: Profile-based MCP acquisition workflow for this repository. Use when a task may require Supabase/Vercel/Vonage/optional MCP servers, when deciding if MCP is mandatory, or when MCP setup is missing and you need a checklist to request only required user configuration.
---

# MCP Acquisition Skill

Use this skill to enforce the repository MCP protocol.

## Workflow
1. Classify task risk using `docs/mcp/task-matrix.md`.
2. Prefer autopilot:
   - `npm run mcp:auto -- --task <ui|core|db|deploy|comms>`
3. If blocked, request only checklist items from the user.
4. For explicit manual flow, use `mcp:profile` + `mcp:doctor`.
5. After task completion, disable high-value MCP servers:
   - `npm run mcp:off`

## Key commands
- `npm run mcp:profile -- list`
- `npm run mcp:auto -- --task core`
- `npm run mcp:status`
- `npm run mcp:doctor -- --profile <profile> --json`
- `npm run mcp:bootstrap:codex -- --profile <profile>`

## References
- `docs/mcp/README.md`
- `docs/mcp/setup-checklist.md`
- `AGENTS.md` (MCP Acquisition Protocol section)
