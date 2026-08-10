// Gas Balloon Landing Predictor - tile cache service worker.
// Cache-first (with background network refresh) for map TILE requests
// only, so previously-cached tiles remain available if the connection
// drops. Deliberately does NOT include api.open-meteo.com - that host
// serves time-sensitive weather/elevation DATA, not tiles, and caching it
// risks serving a stale forecast during a live flight. It was previously
// included here, and very likely caused the intermittent "error (see
// console)" seen specifically on iPad: if the Cache Storage API itself
// misbehaves for any reason (a known reliability quirk on iOS Safari,
// especially in installed/home-screen PWA mode), the whole request this
// service worker took over would fail outright rather than just skipping
// the cache. Weather/elevation requests now bypass this service worker
// entirely, going straight to the network every time.
const CACHE_NAME = 'gblp-tiles-v1';
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'tile.opentopomap.org',
  'server.arcgisonline.com',
  'openinframap.org',
  'api.tiles.openaip.net'
];

self.addEventListener('install', ()=>{ self.skipWaiting(); });
self.addEventListener('activate', (event)=>{ event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (event)=>{
  let url;
  try { url = new URL(event.request.url); } catch(e){ return; }
  if(event.request.method !== 'GET') return;
  if(!TILE_HOSTS.some(h => url.hostname.includes(h))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache)=>{
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request).then((resp)=>{
        if(resp && resp.status === 200){
          cache.put(event.request, resp.clone());
        }
        return resp;
      }).catch(()=> cached);
      // Serve cached immediately if we have it (fast + offline-safe);
      // otherwise wait for the network.
      return cached || networkFetch;
    }).catch(()=>fetch(event.request)) // if the Cache Storage API itself fails for any reason, fall straight through to a normal network fetch rather than failing the request entirely
  );
});
