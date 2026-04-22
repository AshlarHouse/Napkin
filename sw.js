const CACHE = 'napkin-v2';
const ASSETS = ['/', '/index.html', '/spots.json', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

function isLiveContentRequest(url) {
  return url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/spots.json';
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('/.netlify/')) return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isLiveContentRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const cacheKey = url.pathname === '/' ? '/index.html' : url.pathname;
          caches.open(CACHE).then(cache => cache.put(cacheKey, response.clone()));
          return response;
        })
        .catch(() => caches.match(url.pathname === '/' ? '/index.html' : url.pathname))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
