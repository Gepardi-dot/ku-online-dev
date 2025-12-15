import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from '@supabase/supabase-js';

import { isModerator } from '../roles.js';

const baseUser: Partial<User> = {
  id: 'user-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  role: 'authenticated',
  email: 'user@example.com',
  created_at: new Date().toISOString(),
};

test('isModerator returns true for admin or moderator roles', () => {
  const adminUser = { ...baseUser, app_metadata: { role: 'admin' } } as User;
  const moderatorUser = { ...baseUser, user_metadata: { role: 'moderator' } } as User;

  assert.equal(isModerator(adminUser), true);
  assert.equal(isModerator(moderatorUser), true);
});

test('isModerator returns false for missing or non-privileged roles', () => {
  const regularUser = { ...baseUser, app_metadata: { role: 'member' } } as User;
  const noRoleUser = { ...baseUser } as User;

  assert.equal(isModerator(regularUser), false);
  assert.equal(isModerator(noRoleUser), false);
  assert.equal(isModerator(null), false);
});
