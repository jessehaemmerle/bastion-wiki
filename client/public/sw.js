/* Bastion service worker – app shell caching + offline reading of visited pages */
const VERSION = 'bastion-v2';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const API = `${VERSION}-api`;
const SHELL_FILES = ['/', '/boot.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

// API GET endpoints that may be served from cache when offline
const API_CACHEABLE = [/^\/api\/pages\/\d+$/, /^\/api\/spaces(\/[\w-]+)?$/, /^\/api\/dashboard$/, /^\/api\/settings\/public$/, /^\/api\/me$/, /^\/api\/tags$/, /^\/api\/attachments\/\d+$/, /^\/api\/templates$/];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-api-cache') caches.delete(API);
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Bastion-Offline', '1');
      return new Response(await cached.blob(), { status: cached.status, headers });
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (API_CACHEABLE.some((re) => re.test(url.pathname))) event.respondWith(networkFirst(request, API));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) caches.open(ASSETS).then((c) => c.put(request, res.clone()));
        return res;
      })),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
  }
});
