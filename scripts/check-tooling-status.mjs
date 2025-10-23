#!/usr/bin/env node
import { spawn } from 'node:child_process';

const SYMBOLS = {
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
};

const checks = [
  {
    name: 'Vercel CLI',
    probes: [
      {
        label: 'version',
        command: 'vercel',
        args: ['--version'],
        onSuccess: ({ stdout }) => `v${stdout.trim().replace(/^v?/, '')}`,
        onMissing: 'Install with `npm install -D vercel` or `pnpm add -D vercel`.',
        onFailure: 'Run `npx vercel --version` manually to inspect the error output.',
      },
      {
        label: 'authentication',
        command: 'vercel',
        args: ['whoami'],
        optional: true,
        successCodes: [0],
        onSuccess: ({ stdout }) => {
          const identity = stdout.trim();
          return identity ? `Logged in as ${identity}` : 'Authenticated but no username returned.';
        },
        onFailure: 'Not authenticated. Run `npx vercel login` to authorize the CLI.',
      },
    ],
  },
  {
    name: 'Supabase CLI',
    probes: [
      {
        label: 'version',
        command: 'supabase',
        args: ['--version'],
        onSuccess: ({ stdout }) => stdout.split('\n')[0]?.trim() ?? 'Version detected',
        onMissing: 'Install from https://supabase.com/docs/reference/cli/install or `brew install supabase/tap/supabase`.',
        onFailure: 'Run `supabase --version` manually for detailed error output.',
      },
      {
        label: 'MCP support',
        command: 'supabase',
        args: ['mcp', '--help'],
        optional: true,
        onSuccess: () => 'MCP commands available.',
        onFailure: 'CLI does not expose `supabase mcp`. Update to the latest CLI release.',
      },
    ],
  },
];

function runProbe({ command, args }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        settled = true;
        resolve({ status: 'missing', stdout, stderr, error });
      } else {
        settled = true;
        resolve({ status: 'error', code: undefined, stdout, stderr, error });
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        resolve({ status: 'ok', code, stdout, stderr });
      } else {
        resolve({ status: 'error', code, stdout, stderr });
      }
    });
  });
}

async function main() {
  let hasHardFailure = false;

  for (const check of checks) {
    console.log(`\n${check.name}`);
    for (const probe of check.probes) {
      const result = await runProbe(probe);
      let symbol;
      let message;

      switch (result.status) {
        case 'ok': {
          symbol = SYMBOLS.pass;
          const info = probe.onSuccess?.(result);
          message = info ?? 'Success.';
          break;
        }
        case 'missing': {
          const missingMessage = probe.onMissing ?? 'Command not found in PATH.';
          if (probe.optional) {
            symbol = SYMBOLS.warn;
            message = missingMessage;
          } else {
            symbol = SYMBOLS.fail;
            message = missingMessage;
            hasHardFailure = true;
          }
          break;
        }
        default: {
          const successCodes = probe.successCodes ?? [0];
          if (result.code !== undefined && successCodes.includes(result.code)) {
            symbol = SYMBOLS.pass;
            const info = probe.onSuccess?.(result);
            message = info ?? 'Success.';
          } else if (probe.optional) {
            symbol = SYMBOLS.warn;
            message = probe.onFailure ?? 'Optional probe failed.';
          } else {
            symbol = SYMBOLS.fail;
            message = probe.onFailure ?? 'Probe failed.';
            hasHardFailure = true;
          }

          if (result.stdout?.trim()) {
            message += `\n    stdout: ${result.stdout.trim()}`;
          }
          if (result.stderr?.trim()) {
            message += `\n    stderr: ${result.stderr.trim()}`;
          }
          break;
        }
      }

      console.log(`  ${symbol} ${probe.label} – ${message}`);
    }
  }

  console.log('');
  process.exit(hasHardFailure ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ Unexpected error while checking tooling status:', error);
  process.exit(1);
});
