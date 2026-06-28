import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateGate } from '../pwa-ramp-governance.mjs';

const baseThresholds = {
  allowWarn: false,
  failOnWarn: false,
  requireDurable: true,
  expectedRolloutPercent: null,
  maxAlertCount: 0,
  maxPoorVitalsRate: 0.15,
  maxSwFailureRate: 0.05,
  maxDispatchFailures: 0,
  minEvents: 0,
};

function createPayload({ webVitals, poorVitalsRate, minSamples = 30 }) {
  return {
    ok: true,
    source: 'durable',
    durableEnabled: true,
    summary: {
      status: 'pass',
      alerts: [],
      thresholds: { minSamples },
      totals: {
        events: webVitals,
        webVitals,
        poorVitalsRate,
      },
      funnels: {
        serviceWorker: { failureRate: null },
      },
    },
    recentDispatches: [],
  };
}

test('evaluateGate warns instead of failing poor-vitals rate below SLO sample minimum', () => {
  const result = evaluateGate(
    createPayload({ webVitals: 3, poorVitalsRate: 0.6667, minSamples: 30 }),
    baseThresholds,
  );

  assert.equal(result.gateStatus, 'warn');
  assert.equal(
    result.findings.some((finding) => finding.code === 'poor_vitals_rate_low_sample'),
    true,
  );
  assert.equal(
    result.findings.some((finding) => finding.code === 'poor_vitals_rate_exceeded'),
    false,
  );
});

test('evaluateGate still fails poor-vitals rate when sample volume is credible', () => {
  const result = evaluateGate(
    createPayload({ webVitals: 30, poorVitalsRate: 0.316, minSamples: 30 }),
    baseThresholds,
  );

  assert.equal(result.gateStatus, 'fail');
  assert.equal(
    result.findings.some((finding) => finding.code === 'poor_vitals_rate_exceeded'),
    true,
  );
});
