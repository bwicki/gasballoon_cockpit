/* GB Notion Frontend — keeps the app shell available offline.
   The GitHub API is never served from cache.

   One rule above all: a missing file must never stop a new version from taking over.
   cache.addAll() rejects as a whole if a single request fails, and a worker whose install
   fails is never activated — the app then keeps serving the previous version for ever,
   which is exactly the sort of fault that hides every other change. Each file is therefore
   cached on its own and a failure is noted and passed over. */
const V = 'basket-reporting-v260825-01';

/* the files the app cannot run without */
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest'
];

/* everything else is nice to have offline and never worth failing an install for */
const EXTRA = [
  './readme.html',
  './setup.html',
  './notion.html',
  './license.html',
  './logo.png',
  './favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

async function cacheEach(cache, list) {
  const missing = [];
  await Promise.all(list.map(async url => {
    try {
      const r = await fetch(url, { cache: 'reload' });
      if (!r || !r.ok) { missing.push(url + ' → ' + (r ? r.status : 'no response')); return; }
      await cache.put(url, r);
    } catch (err) { missing.push(url + ' → ' + err.message); }
  }));
  return missing;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    const gone = (await cacheEach(c, CORE)).concat(await cacheEach(c, EXTRA));
    if (gone.length) console.warn('[sw] not cached, carrying on:', gone.join(' | '));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    /* the map tiles are gathered for a flight, not for a version — they outlive the shell */
    await Promise.all(ks.filter(k => k !== V && k !== 'basket-tiles').map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'api.github.com') return;            // always live
  if (url.hostname === 'nominatim.openstreetmap.org') return;
  if (url.origin !== self.location.origin) {
    /* Map tiles: what is already held is served first, and anything fetched to draw the map
       is kept on the way past. That is ordinary browser caching of what the crew actually
       looked at — no background harvesting, which every tile provider's terms are about. */
    e.respondWith((async () => {
      const c = await caches.open('basket-tiles');
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r && r.ok && r.type !== 'opaque') { try { await c.put(e.request, r.clone()) } catch (err) {} }
      return r;
    })());
    return;
  }

  /* network first, so a deploy takes effect at once; the cache carries the flight */
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
