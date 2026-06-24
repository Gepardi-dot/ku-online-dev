import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseArgs,
  parsePositiveNumber,
  summarizeProject,
} from '../supabase-project-status.mjs';

test('project status parser keeps explicit wait settings', () => {
  const args = parseArgs([
    '--project-ref',
    'iypynouqbmmvoqecfmuw',
    '--expect',
    'ACTIVE_HEALTHY',
    '--timeout-seconds',
    '900',
    '--interval-seconds',
    '15',
    '--json',
  ]);

  assert.deepEqual(args, {
    projectRef: 'iypynouqbmmvoqecfmuw',
    expect: 'ACTIVE_HEALTHY',
    timeoutSeconds: 900,
    intervalSeconds: 15,
    json: true,
  });
});

test('project status parser rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['--project-ref', 'abc', '--unexpected']), /Unknown argument/);
});

test('positive numeric parser rejects invalid polling values', () => {
  assert.equal(parsePositiveNumber('30', '--timeout-seconds'), 30);
  assert.throws(() => parsePositiveNumber('0', '--timeout-seconds'), /positive number/);
  assert.throws(() => parsePositiveNumber('not-a-number', '--interval-seconds'), /positive number/);
});

test('project summary normalizes management API project shape', () => {
  const summary = summarizeProject({
    id: 'fallback-ref',
    name: 'ku-online-staging',
    status: 'INACTIVE',
    region: 'eu-central-1',
    database: { version: '17.6.1' },
  });

  assert.deepEqual(summary, {
    ref: 'fallback-ref',
    name: 'ku-online-staging',
    status: 'INACTIVE',
    region: 'eu-central-1',
    database: { version: '17.6.1' },
  });
});
