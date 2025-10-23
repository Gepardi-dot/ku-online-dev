export async function cookies() {
  return (
    globalThis.__cookiesMock ?? {
      getAll: () => [],
      set: () => {},
    }
  );
}
