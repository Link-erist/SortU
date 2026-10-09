// Increment APP_VERSION and the matching index.html meta tag together for each release.
const APP_VERSION = 'v3';
const CACHE_PREFIX = 'appbuildershackathon-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const APP_ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/icons/mark.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/transfer-entry.js', '/transfer/pairing.js', '/transfer/qr.js', '/transfer/protocol.js',
  '/transfer/engine.js', '/transfer/storage.js', '/transfer/hash.js', '/transfer/hash-worker.js',
  '/transfer/ui.js', '/transfer/resources.js', '/vendor/qrcodegen.js', '/vendor/jsqr.js', '/vendor/sha256.js',
  '/vendor/LICENSES.txt', '/vendor/manifest.json'
];

self.addEventListener('message', event => {
  if (event.data?.type === 'APP_VERSION') event.ports?.[0]?.postMessage({version: APP_VERSION});
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
          // A waiting worker owns the next shell. Keep this active shell's HTML
          // paired with its cached CSS/JS until all old app windows have closed.
          const html = await response.clone().text();
          if (!html.includes(`<meta name="app-shell-version" content="${APP_VERSION}">`)) {
            return await cache.match('/') || response;
          }
          event.waitUntil(cache.put('/', response.clone()).catch(() => {}));
        }
        return response;
      } catch {
        return await cache.match('/') || Response.error();
      }
    })());
    return;
  }

  if (APP_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.pathname) || fetch(event.request);
    })());
  }
});
