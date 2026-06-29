import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ABUSE_REPORT_DETAILS_MAX_LENGTH,
  ABUSE_REPORT_REASON_MAX_LENGTH,
  BLOCK_REASON_MAX_LENGTH,
  isUuid,
  parseAbuseReportInput,
  parseBlockUserInput,
  parseManageReportInput,
} from '../abuse-input.js';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const REPORT_ID = '33333333-3333-4333-8333-333333333333';

test('isUuid accepts supported UUID strings and rejects arbitrary text', () => {
  assert.equal(isUuid(PRODUCT_ID), true);
  assert.equal(isUuid(` ${PRODUCT_ID} `), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
});

test('parseAbuseReportInput normalizes a valid report payload', () => {
  const result = parseAbuseReportInput({
    targetType: 'product',
    targetId: ` ${PRODUCT_ID} `,
    reason: '  Scam listing  ',
    details: '  Asked for off-platform payment.  ',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    targetType: 'product',
    targetId: PRODUCT_ID,
    reason: 'Scam listing',
    details: 'Asked for off-platform payment.',
  });
});

test('parseAbuseReportInput rejects unsupported target types and invalid IDs', () => {
  assert.equal(
    parseAbuseReportInput({
      targetType: 'store',
      targetId: PRODUCT_ID,
      reason: 'Spam',
    }).ok,
    false,
  );

  assert.equal(
    parseAbuseReportInput({
      targetType: 'message',
      targetId: 'message-1',
      reason: 'Spam',
    }).ok,
    false,
  );
});

test('parseAbuseReportInput rejects missing or oversized report text', () => {
  assert.equal(
    parseAbuseReportInput({
      targetType: 'user',
      targetId: USER_ID,
      reason: '   ',
    }).ok,
    false,
  );

  assert.equal(
    parseAbuseReportInput({
      targetType: 'user',
      targetId: USER_ID,
      reason: 'x'.repeat(ABUSE_REPORT_REASON_MAX_LENGTH + 1),
    }).ok,
    false,
  );

  assert.equal(
    parseAbuseReportInput({
      targetType: 'user',
      targetId: USER_ID,
      reason: 'Suspicious',
      details: 'x'.repeat(ABUSE_REPORT_DETAILS_MAX_LENGTH + 1),
    }).ok,
    false,
  );
});

test('parseBlockUserInput normalizes optional reason and rejects invalid IDs', () => {
  const result = parseBlockUserInput({
    blockedUserId: ` ${USER_ID} `,
    reason: '  Harassment  ',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    blockedUserId: USER_ID,
    reason: 'Harassment',
  });

  assert.equal(parseBlockUserInput({ blockedUserId: 'bad-id' }).ok, false);
  assert.equal(
    parseBlockUserInput({
      blockedUserId: USER_ID,
      reason: 'x'.repeat(BLOCK_REASON_MAX_LENGTH + 1),
    }).ok,
    false,
  );
});

test('parseManageReportInput normalizes valid moderator actions', () => {
  const result = parseManageReportInput({
    id: ` ${REPORT_ID} `,
    status: 'resolved',
    reactivateProduct: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    id: REPORT_ID,
    status: 'resolved',
    reactivateProduct: true,
  });
});

test('parseManageReportInput rejects invalid report IDs and statuses', () => {
  assert.equal(parseManageReportInput({ id: 'report-1', status: 'resolved' }).ok, false);
  assert.equal(parseManageReportInput({ id: REPORT_ID, status: 'deleted' }).ok, false);
});
