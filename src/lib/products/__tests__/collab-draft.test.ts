import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { User } from '@supabase/supabase-js';

import {
  COLLAB_DRAFT_DEFAULT_CONDITION,
  COLLAB_DRAFT_DEFAULT_TITLE,
  canAccessCollabDraft,
  canPublishCollabDraft,
  collabDraftPath,
} from '../collab-draft';

function user(id: string, role?: string): User {
  return {
    id,
    app_metadata: role ? { role } : {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  } as User;
}

const sellerId = '11111111-1111-4111-8111-111111111111';

test('seller can open their draft but cannot publish', () => {
  const seller = user(sellerId);
  assert.equal(canAccessCollabDraft(seller, sellerId), true);
  assert.equal(canPublishCollabDraft(seller), false);
});

test('admin and moderator can open and publish any draft', () => {
  const admin = user('22222222-2222-4222-8222-222222222222', 'admin');
  const moderator = user('33333333-3333-4333-8333-333333333333', 'moderator');
  assert.equal(canAccessCollabDraft(admin, sellerId), true);
  assert.equal(canAccessCollabDraft(moderator, sellerId), true);
  assert.equal(canPublishCollabDraft(admin), true);
  assert.equal(canPublishCollabDraft(moderator), true);
});

test('signed-out users and other sellers cannot open the draft', () => {
  const other = user('44444444-4444-4444-8444-444444444444');
  assert.equal(canAccessCollabDraft(null, sellerId), false);
  assert.equal(canAccessCollabDraft(other, sellerId), false);
  assert.equal(canPublishCollabDraft(null), false);
});

test('draft path and placeholders stay stable', () => {
  assert.equal(collabDraftPath(sellerId), `/draft/${sellerId}`);
  assert.equal(COLLAB_DRAFT_DEFAULT_TITLE, 'Untitled listing');
  assert.equal(COLLAB_DRAFT_DEFAULT_CONDITION, 'Used - Good');
});
