// Gas Balloon Landing Predictor - tile cache service worker.
// Cache-first (with background network refresh) for map/data tile requests,
// so previously-cached tiles remain available if the connection drops.
const CACHE_NAME = 'gblp-tiles-v1';
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'tile.opentopomap.org',
  'server.arcgisonline.com',
  'openinframap.org',
  'api.tiles.openaip.net',
  'api.open-meteo.com'
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
    })
  );
});
