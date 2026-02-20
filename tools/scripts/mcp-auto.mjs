#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const profileScript = path.join(repoRoot, 'tools', 'scripts', 'mcp-profile.mjs');
const doctorScript = path.join(repoRoot, 'tools', 'scripts', 'mcp-doctor.mjs');

const TASK_MAP = {
  minimal: {
    profile: 'minimal',
    gate: 'soft',
    description: 'Low-risk local UI/refactor/docs tasks.',
  },
  ui: {
    profile: 'minimal',
    gate: 'soft',
    description: 'Low-risk UI/local tasks.',
  },
  core: {
    profile: 'core',
    gate: 'soft',
    description: 'General Supabase/Vercel context tasks.',
  },
  db: {
    profile: 'db-admin',
    gate: 'hard',
    description: 'DB schema/RLS/auth/storage operations.',
  },
  deploy: {
    profile: 'deploy',
    gate: 'hard',
    description: 'Deployment/production diagnostics.',
  },
  comms: {
    profile: 'comms',
    gate: 'hard',
    description: 'External provider/Vonage operations.',
  },
};

function usage() {
  console.log(`
Usage:
  node tools/scripts/mcp-auto.mjs --task <minimal|ui|core|db|deploy|comms> [--strict] [--keep-profile] [--doctor-only] [-- <command> ...]

Examples:
  node tools/scripts/mcp-auto.mjs --task core
  node tools/scripts/mcp-auto.mjs --task db -- node tools/scripts/supabase-parity-report.mjs --prod-ref <ref> --staging-ref <ref>
  node tools/scripts/mcp-auto.mjs --task deploy -- npx vercel logs <deployment-url>
`);
}

function parseArgs(argv) {
  const options = {
    task: null,
    strict: false,
    keepProfile: false,
    doctorOnly: false,
  };
  const command = [];

  let inCommand = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (inCommand) {
      command.push(token);
      continue;
    }

    if (token === '--') {
      inCommand = true;
      continue;
    }

    if (token === '--task') {
      options.task = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token.startsWith('--task=')) {
      options.task = token.slice('--task='.length);
      continue;
    }

    if (token === '--strict') {
      options.strict = true;
      continue;
    }

    if (token === '--keep-profile') {
      options.keepProfile = true;
      continue;
    }

    if (token === '--doctor-only') {
      options.doctorOnly = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }
  }

  return { options, command };
}

function quoteArg(arg) {
  if (!/[\s"]/u.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function runNodeScript(scriptPath, args, { capture = false } = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });
}

function runUserCommand(commandTokens) {
  if (!commandTokens.length) {
    return { status: 0 };
  }

  if (process.platform === 'win32') {
    const cmdLine = commandTokens.map(quoteArg).join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], {
      cwd: repoRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
  }

  return spawnSync(commandTokens[0], commandTokens.slice(1), {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
}

function normalizedExitCode(result) {
  return typeof result?.status === 'number' ? result.status : 1;
}

function main() {
  const { options, command } = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  if (!options.task) {
    console.error('Missing required argument: --task <task>');
    usage();
    process.exit(1);
  }

  const taskConfig = TASK_MAP[options.task];
  if (!taskConfig) {
    console.error(`Unknown task "${options.task}".`);
    usage();
    process.exit(1);
  }

  const { profile, gate, description } = taskConfig;
  console.log(`MCP auto: task=${options.task} profile=${profile} gate=${gate}`);
  console.log(`MCP auto: ${description}`);

  const activateResult = runNodeScript(profileScript, ['activate', profile]);
  if (normalizedExitCode(activateResult) !== 0) {
    process.exit(normalizedExitCode(activateResult));
  }

  const doctorArgs = ['--profile', profile, '--emit-checklist'];
  if (options.strict) {
    doctorArgs.push('--strict');
  }

  const doctorResult = runNodeScript(doctorScript, doctorArgs);
  const doctorExit = normalizedExitCode(doctorResult);
  const shouldBlock = gate === 'hard' || options.strict;

  if (doctorExit !== 0 && shouldBlock) {
    console.error('MCP auto: doctor blocked this high-risk workflow.');
    if (!options.keepProfile) {
      runNodeScript(profileScript, ['reset']);
    }
    process.exit(doctorExit);
  }

  if (doctorExit !== 0 && !shouldBlock) {
    console.warn('MCP auto: doctor reported issues, continuing because this task is soft-gated.');
  }

  if (options.doctorOnly) {
    if (!options.keepProfile) {
      runNodeScript(profileScript, ['reset']);
    }
    process.exit(0);
  }

  const commandResult = runUserCommand(command);
  const commandExit = normalizedExitCode(commandResult);

  const shouldReset = !options.keepProfile && command.length > 0;
  if (shouldReset) {
    const resetResult = runNodeScript(profileScript, ['reset']);
    const resetExit = normalizedExitCode(resetResult);
    if (commandExit === 0 && resetExit !== 0) {
      process.exit(resetExit);
    }
  }

  process.exit(commandExit);
}

main();
