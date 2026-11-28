// Cadence offline support. Asks the network first so a published change shows on the next launch,
// and falls back to the saved copy when there is no signal or the answer takes too long.
const CACHE = 'cadence-v2';
const SHELL = ['./', 'cadence.css', 'cadence.js', 'manifest.json', 'icon.svg', 'icon-180.png', 'icon-512.png'];
const WAIT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cadence-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const fresh = fetch(request.url, { cache: 'no-cache' }).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    if (!cached) return fresh;
    event.waitUntil(fresh.catch(() => {}));
    const slow = new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    const response = await Promise.race([fresh.catch(() => null), slow]);
    return response && response.ok ? response : cached;
  })());
});
