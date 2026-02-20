#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const memoryDir = path.join(rootDir, 'docs', 'agent-memory');
const statePath = path.join(memoryDir, 'STATE.json');
const journalPath = path.join(memoryDir, 'JOURNAL.md');

function nowIso() {
  return new Date().toISOString();
}

function ensureMemoryFiles() {
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  if (!fs.existsSync(statePath)) {
    const fallbackState = {
      schema_version: '1.0.0',
      last_updated_utc: nowIso(),
      session_context: {
        active_objective: '',
        current_task: {
          id: '',
          title: '',
          status: 'pending',
          phase: '',
        },
        next_task: {
          id: '',
          title: '',
        },
        latest_user_request: '',
      },
      decisions: [],
      open_risks: [],
      verification_log: [],
    };
    fs.writeFileSync(statePath, `${JSON.stringify(fallbackState, null, 2)}\n`, 'utf8');
  }

  if (!fs.existsSync(journalPath)) {
    fs.writeFileSync(journalPath, '# Agent Journal\n\n', 'utf8');
  }
}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(state) {
  state.last_updated_utc = nowIso();
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parseFlags(args) {
  const flags = {};
  let i = 0;

  while (i < args.length) {
    const token = args[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected token: ${token}`);
    }

    const key = token.slice(2);
    const next = args[i + 1];

    if (!next || next.startsWith('--')) {
      flags[key] = 'true';
      i += 1;
      continue;
    }

    flags[key] = next;
    i += 2;
  }

  return flags;
}

function appendJournalEntry({
  type,
  taskId,
  taskTitle,
  summary,
  details,
  verification,
}) {
  const lines = [
    `## ${nowIso()}`,
    `- type: ${type ?? 'note'}`,
    ...(taskId ? [`- task_id: ${taskId}`] : []),
    ...(taskTitle ? [`- task_title: ${taskTitle}`] : []),
    ...(summary ? [`- summary: ${summary}`] : []),
    ...(details ? [`- details: ${details}`] : []),
    ...(verification ? [`- verification: ${verification}`] : []),
    '',
  ];

  fs.appendFileSync(journalPath, `${lines.join('\n')}\n`, 'utf8');
}

function showState() {
  const state = readState();
  const currentTask = state?.session_context?.current_task ?? {};
  const nextTask = state?.session_context?.next_task ?? {};

  const output = {
    last_updated_utc: state.last_updated_utc,
    active_objective: state?.session_context?.active_objective ?? '',
    current_task: currentTask,
    next_task: nextTask,
    latest_user_request: state?.session_context?.latest_user_request ?? '',
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function setState(flags) {
  const state = readState();
  const session = state.session_context ?? {};
  const currentTask = session.current_task ?? {};
  const nextTask = session.next_task ?? {};

  if (flags.objective) session.active_objective = flags.objective;
  if (flags['user-request']) session.latest_user_request = flags['user-request'];
  if (flags['task-id']) currentTask.id = flags['task-id'];
  if (flags['task-title']) currentTask.title = flags['task-title'];
  if (flags.status) currentTask.status = flags.status;
  if (flags.phase) currentTask.phase = flags.phase;
  if (flags['next-task-id']) nextTask.id = flags['next-task-id'];
  if (flags['next-task-title']) nextTask.title = flags['next-task-title'];

  session.current_task = currentTask;
  session.next_task = nextTask;
  state.session_context = session;

  if (flags['add-decision']) {
    if (!Array.isArray(state.decisions)) state.decisions = [];
    state.decisions.push({
      timestamp_utc: nowIso(),
      decision: flags['add-decision'],
    });
  }

  if (flags['add-risk']) {
    if (!Array.isArray(state.open_risks)) state.open_risks = [];
    state.open_risks.push(flags['add-risk']);
  }

  if (flags['add-verification']) {
    if (!Array.isArray(state.verification_log)) state.verification_log = [];
    state.verification_log.push({
      timestamp_utc: nowIso(),
      check: flags['add-verification'],
      status: flags['verification-status'] ?? 'pass',
    });
  }

  writeState(state);

  if (flags.note) {
    appendJournalEntry({
      type: flags['note-type'] ?? 'note',
      taskId: currentTask.id,
      taskTitle: currentTask.title,
      summary: flags.note,
    });
  }
}

function logEntry(flags) {
  if (!flags.summary) {
    throw new Error('Missing required flag: --summary');
  }

  appendJournalEntry({
    type: flags.type ?? 'progress',
    taskId: flags['task-id'],
    taskTitle: flags['task-title'],
    summary: flags.summary,
    details: flags.details,
    verification: flags.verification,
  });

  const state = readState();
  writeState(state);
}

function showHelp() {
  const help = [
    'Usage:',
    '  node tools/scripts/agent-memory.mjs show',
    '  node tools/scripts/agent-memory.mjs set [--objective "..."] [--task-id "..."] [--task-title "..."] [--status "..."] [--phase "..."] [--next-task-id "..."] [--next-task-title "..."] [--user-request "..."] [--add-decision "..."] [--add-risk "..."] [--add-verification "..."] [--verification-status "..."] [--note "..."] [--note-type "..."]',
    '  node tools/scripts/agent-memory.mjs log --summary "..." [--type "..."] [--task-id "..."] [--task-title "..."] [--details "..."] [--verification "..."]',
  ].join('\n');

  process.stdout.write(`${help}\n`);
}

function main() {
  ensureMemoryFiles();

  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  if (command === 'show') {
    showState();
    return;
  }

  const flags = parseFlags(rest);

  if (command === 'set') {
    setState(flags);
    return;
  }

  if (command === 'log') {
    logEntry(flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent-memory error: ${message}`);
  process.exit(1);
}
