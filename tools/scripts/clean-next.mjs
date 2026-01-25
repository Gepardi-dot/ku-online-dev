import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const target = resolve(root, '.next');

try {
  await rm(target, { recursive: true, force: true });
  console.log('[clean] removed .next');
} catch (error) {
  console.warn('[clean] failed to remove .next', error);
  process.exitCode = 1;
}
