import 'fake-indexeddb/auto';

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('dark'), media: q, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
