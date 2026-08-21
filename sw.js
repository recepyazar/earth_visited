/* EarthVisited service worker.
   The shell and the flat map are precached so the app opens offline; the globe
   bundle is big and optional, so it is only cached once someone actually loads it.
   Bump CACHE when deploying: the new worker drops every older cache on activate. */
const CACHE = 'earthvisited-v18';

const SHELL = [
  './',
  'index.html',
  'css/style.css?v=18',
  'js/i18n.js?v=18',
  'js/share.js?v=18',
  'js/admin1/index.js?v=18',
  'js/data.js?v=18',
  'js/card.js?v=18',
  'js/app.js?v=18',
  'assets/logo.svg',
  'assets/favicon.svg',
  'assets/flags/xn.svg',
  'assets/fonts/TwemojiCountryFlags.woff2',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other hosts

  // HTML: network first, so a deploy shows up immediately, cache as the offline fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // everything else: cache first, and remember whatever we had to fetch (the globe
  // bundle lands here the first time it is used)
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
