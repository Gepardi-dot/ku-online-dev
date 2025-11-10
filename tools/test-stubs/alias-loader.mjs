import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const stubMap = new Map([
  ['@/utils/supabase/server', pathToFileURL(path.join(rootDir, 'tools', 'test-stubs', 'supabase-server.js')).href],
  ['@/lib/storage', pathToFileURL(path.join(rootDir, 'tools', 'test-stubs', 'storage.js')).href],
  ['next/headers', pathToFileURL(path.join(rootDir, 'tools', 'test-stubs', 'next-headers.js')).href],
]);

export async function resolve(specifier, context, nextResolve) {
  if (stubMap.has(specifier)) {
    return { shortCircuit: true, url: stubMap.get(specifier) };
  }

  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2);
    const candidates = [
      path.join(rootDir, 'dist-tests', `${relativePath}.js`),
      path.join(rootDir, 'dist-tests', `${relativePath}.mjs`),
      path.join(rootDir, 'dist-tests', relativePath, 'index.js'),
      path.join(rootDir, 'dist-tests', relativePath, 'index.mjs'),
    ];

    const target = candidates.find((candidate) => fs.existsSync(candidate));
    if (target) {
      return { shortCircuit: true, url: pathToFileURL(target).href };
    }
  }

  return nextResolve(specifier, context);
}
