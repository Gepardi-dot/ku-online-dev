#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(relativePath) {
  const absPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absPath)) return;

  const raw = fs.readFileSync(absPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const [, key, rest] = match;
    let value = rest.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveCommand(command) {
  if (process.platform === 'win32' && (command === 'npm' || command === 'npx')) {
    return `${command}.cmd`;
  }
  return command;
}

function runCommand(command, args, options = {}) {
  const { capture = false } = options;
  const resolvedCommand = resolveCommand(command);
  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${exitCode}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseStatusEnv(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function printUsage() {
  console.log('Usage: npm run supabase:admin:grant -- --email <email> [--email <email2>] [options]');
  console.log('Options:');
  console.log('  --role admin|moderator     Default: admin');
  console.log('  --create-missing           Create users when email not found');
  console.log('  --password <password>      Required with --create-missing');
  console.log('  --full-name <name>         Default: Admin User');
  console.log('  --local                    Use local Supabase from `supabase status -o env`');
}

function parseArgs(argv) {
  const args = {
    emails: [],
    role: 'admin',
    createMissing: false,
    password: '',
    fullName: 'Admin User',
    useLocal: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--email') {
      const value = (argv[i + 1] ?? '').trim().toLowerCase();
      if (value) args.emails.push(value);
      i += 1;
      continue;
    }
    if (current === '--role') {
      args.role = (argv[i + 1] ?? 'admin').trim().toLowerCase();
      i += 1;
      continue;
    }
    if (current === '--create-missing') {
      args.createMissing = true;
      continue;
    }
    if (current === '--password') {
      args.password = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (current === '--full-name') {
      args.fullName = argv[i + 1] ?? args.fullName;
      i += 1;
      continue;
    }
    if (current === '--local') {
      args.useLocal = true;
      continue;
    }
    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  args.emails = [...new Set(args.emails)];
  return args;
}

async function loadLocalSupabaseCredentials() {
  const result = await runCommand('supabase', ['status', '-o', 'env'], { capture: true });
  const parsed = parseStatusEnv(result.stdout);
  return {
    url: parsed.API_URL ?? '',
    serviceRoleKey: parsed.SERVICE_ROLE_KEY ?? '',
  };
}

async function findUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 1000;

  // auth.admin.getUserByEmail is not available in all SDK versions; paginate defensively.
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensurePublicUserRow(supabase, user, fullName) {
  const payload = {
    id: user.id,
    email: user.email ?? null,
    full_name: fullName,
  };
  // Insert only; do not overwrite existing profile fields like full_name.
  const { error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    throw error;
  }
}

async function main() {
  loadEnvFile('.env');
  loadEnvFile('.env.local');

  const args = parseArgs(process.argv.slice(2));
  if (!args.emails.length) {
    printUsage();
    process.exit(1);
  }
  if (!['admin', 'moderator'].includes(args.role)) {
    throw new Error(`Unsupported role "${args.role}". Allowed: admin, moderator.`);
  }
  if (args.createMissing && !args.password) {
    throw new Error('--password is required when --create-missing is used.');
  }

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (args.useLocal) {
    const local = await loadLocalSupabaseCredentials();
    url = local.url;
    serviceRoleKey = local.serviceRoleKey;
  }

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --local).',
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let updatedCount = 0;
  let createdCount = 0;
  let missingCount = 0;

  for (const email of args.emails) {
    const existing = await findUserByEmail(supabase, email);
    let user = existing;

    if (!user && args.createMissing) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: args.password,
        email_confirm: true,
        app_metadata: { role: args.role },
        user_metadata: { role: args.role },
      });
      if (error) throw error;
      user = data.user;
      createdCount += 1;
      console.log(`Created auth user: ${email}`);
    }

    if (!user) {
      missingCount += 1;
      console.warn(`User not found (skipped): ${email}`);
      continue;
    }

    const nextAppMetadata = { ...(user.app_metadata ?? {}), role: args.role };
    const nextUserMetadata = { ...(user.user_metadata ?? {}), role: args.role };
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: nextAppMetadata,
      user_metadata: nextUserMetadata,
      email_confirm: true,
    });
    if (updateError) throw updateError;

    await ensurePublicUserRow(supabase, user, args.fullName);
    updatedCount += 1;
    console.log(`Granted ${args.role} role: ${email}`);
  }

  console.log('\nRole grant summary:');
  console.log(`- target url: ${url}`);
  console.log(`- updated: ${updatedCount}`);
  console.log(`- created: ${createdCount}`);
  console.log(`- missing/skipped: ${missingCount}`);
}

main().catch((error) => {
  console.error('Role grant failed:', error.message);
  process.exit(1);
});
