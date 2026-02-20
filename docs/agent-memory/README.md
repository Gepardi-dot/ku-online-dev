# Agent Memory System

This folder is the persistent working memory for Codex in this repository.

## Goals
- Preserve task context across turns.
- Keep decision history and verification evidence.
- Make next steps explicit before switching tasks.

## Canonical Files
- `docs/agent-memory/STATE.json`
  - Machine-readable current truth.
  - Always read this first before starting a new task.
- `docs/agent-memory/JOURNAL.md`
  - Append-only timeline of actions, decisions, and verification.

## Update Protocol
1. Task start:
   - Update `STATE.json` (`active_objective`, `current_task`, `next_task`).
   - Add a `task_start` entry to `JOURNAL.md`.
2. Significant step:
   - Add a `progress` entry to `JOURNAL.md`.
   - Update status fields in `STATE.json` if scope changes.
3. Task completion:
   - Set `current_task.status` to `completed`.
   - Move the upcoming item into `next_task`.
   - Add a `task_complete` entry with verification notes.

## CLI Helper
Use `tools/scripts/agent-memory.mjs` to keep updates consistent.

Examples:
```bash
npm run memory:show
npm run memory:set -- --objective "Implement PWA Phase 1" --task-id "pwa-phase-1" --task-title "Installability baseline" --status "in_progress" --phase "phase_1"
npm run memory:log -- --type progress --summary "Added manifest and metadata wiring" --verification "npm run typecheck passed"
```

## Integrity Rules
- Do not delete journal history.
- Prefer concise factual entries.
- Always include concrete verification when available (commands and outcomes).
