export async function createSignedUrls(paths) {
  const map = {};
  for (const path of paths ?? []) {
    if (typeof path === 'string' && path.length > 0) {
      map[path] = path;
    }
  }
  return map;
}

export async function createSignedUrl(path) {
  if (!path) {
    return null;
  }
  return path;
}
