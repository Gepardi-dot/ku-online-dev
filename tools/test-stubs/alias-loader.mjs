import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const stubMap = new Map([
  ['@/utils/supabase/server', pathToFileURL(path.join(rootDir, 'tools', 'test-stubs', 'supabase-server.js')).href],
  ['next/headers', pathToFileURL(path.join(rootDir, 'tools', 'test-stubs', 'next-headers.js')).href],
]);

export async function resolve(specifier, context, nextResolve) {
  if (stubMap.has(specifier)) {
    return { shortCircuit: true, url: stubMap.get(specifier) };
  }

  return nextResolve(specifier, context);
}
