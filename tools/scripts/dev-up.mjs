#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const failure = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
      failure.exitCode = code;
      reject(failure);
    });
  });
}

async function runSupabaseStart() {
  console.log('➡️  Ensuring local Supabase is running...');
  try {
    await runCommand('supabase', ['start']);
  } catch (firstError) {
    const missingBinary = process.platform === 'win32' && firstError?.code === 'ENOENT';
    if (!missingBinary) throw firstError;
    // Windows fallback when command resolution fails in non-interactive shells.
    await runCommand('cmd.exe', ['/d', '/s', '/c', 'supabase', 'start']);
  }
}

async function runLocalDev() {
  const localDevScript = path.join(process.cwd(), 'tools', 'scripts', 'dev-local.mjs');
  await runCommand(process.execPath, [localDevScript], process.env);
}

(async () => {
  try {
    await runSupabaseStart();
    console.log('➡️  Starting dev server in local mode...');
    await runLocalDev();
  } catch (error) {
    const message = error?.message ?? String(error);
    console.error(message);
    process.exit(1);
  }
})();
