// Service worker: caches the whole game so it loads instantly and plays offline.
// The deploy workflow replaces __BUILD__ with the commit id, so every push gets a fresh cache.
// Run, Abood! may live on the same origin: this worker only ever touches caches named 'abood-moon-*'.
const VERSION = '__BUILD__';
const CACHE = 'abood-moon-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/game.js',
  './js/ui.js',
  './js/art.js',
  './js/i18n.js',
  './js/meta.js',
  './js/pieces.js',
  './js/vendor/zzfx.js',
  './assets/fonts/baloo-bhaijaan-2-arabic-500-normal.woff2',
  './assets/fonts/baloo-bhaijaan-2-arabic-700-normal.woff2',
  './assets/fonts/baloo-bhaijaan-2-arabic-800-normal.woff2',
  './assets/fonts/baloo-bhaijaan-2-latin-500-normal.woff2',
  './assets/fonts/baloo-bhaijaan-2-latin-700-normal.woff2',
  './assets/fonts/baloo-bhaijaan-2-latin-800-normal.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's HTTP cache so a new version never stores stale files
    await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // only our own old versions; never another game's caches on the same origin
    await Promise.all(keys.filter(k => k.startsWith('abood-moon-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: try the network first (so updates show up), fall back to the cached copy offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(req, { signal: ctrl.signal }); clearTimeout(timer);
        if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy))); }
        return res;
      } catch {
        return (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./', { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Everything else (scripts, styles, fonts, icons): cache first, then network.
  // Files stamped with another build (?v=...) skip this cache, so a fresh page never gets this version's old files.
  const v = url.searchParams.get('v'), ours = !v || v === VERSION;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (ours) { const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit; }
    try {
      const res = await fetch(req);
      if (ours && res.ok && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()));
      return res;
    } catch { return (await cache.match(req, { ignoreSearch: true })) || Response.error(); }
  })());
});
