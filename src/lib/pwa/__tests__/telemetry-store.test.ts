import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizePwaTelemetryEvent } from '../telemetry-store.js';

const now = Date.parse('2026-06-28T21:10:00.000Z');

describe('normalizePwaTelemetryEvent', () => {
  it('keeps plausible supported web-vital samples', () => {
    const result = normalizePwaTelemetryEvent(
      {
        type: 'web_vital',
        name: 'LCP',
        ts: now,
        path: '/',
        value: 13_664,
        rating: 'poor',
      },
      { displayMode: 'browser' },
      now,
    );

    assert.notEqual(result, null);
    assert.equal(result?.name, 'lcp');
    assert.equal(result?.value, 13_664);
    assert.equal(result?.rating, 'poor');
  });

  it('rejects unsupported web-vital names', () => {
    const result = normalizePwaTelemetryEvent(
      {
        type: 'web_vital',
        name: 'FID',
        ts: now,
        path: '/',
        value: 3.2,
        rating: 'good',
      },
      { displayMode: 'browser' },
      now,
    );

    assert.equal(result, null);
  });

  it('rejects implausible stale web-vital values', () => {
    const result = normalizePwaTelemetryEvent(
      {
        type: 'web_vital',
        name: 'FCP',
        ts: now,
        path: '/',
        value: 233_804,
        rating: 'poor',
      },
      { displayMode: 'browser' },
      now,
    );

    assert.equal(result, null);
  });

  it('keeps lifecycle events without applying web-vital caps', () => {
    const result = normalizePwaTelemetryEvent(
      {
        type: 'pwa_lifecycle',
        name: 'rollout_disabled',
        ts: now,
        path: '/',
        value: 1,
        unit: 'count',
      },
      { displayMode: 'browser' },
      now,
    );

    assert.notEqual(result, null);
    assert.equal(result?.name, 'rollout_disabled');
    assert.equal(result?.value, 1);
  });
});
