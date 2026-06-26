export function algoliasearch() {
  return {
    searchSingleIndex(...args) {
      if (typeof globalThis.__algoliaSearchSingleIndexMock === 'function') {
        return globalThis.__algoliaSearchSingleIndexMock(...args);
      }
      return Promise.resolve({ hits: [], nbHits: 0 });
    },
  };
}
