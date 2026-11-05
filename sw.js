/* Offline support: the app shell is cached on install, fonts and the Supabase library are cached on first use.
   Supabase API and storage calls always go to the network; the app keeps its own copy of data and files. */
const VERSION='taebo-travel-v26';
const SHELL=['./','index.html','styles.css','data.js','sync.js','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
  'vendor/supabase-2.45.4.js','vendor/591.supabase.js','vendor/leaflet-1.9.4/leaflet.js','vendor/leaflet-1.9.4/leaflet.css','vendor/maplibre-gl-4.7.1/maplibre-gl.js','vendor/maplibre-gl-4.7.1/maplibre-gl.css','vendor/maplibre-gl-4.7.1/leaflet-maplibre-gl.js'];
const TILES='taebo-tiles-v3';
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION&&k!==TILES).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.hostname.endsWith('supabase.co'))return;
  if(u.origin===location.origin){
    // app files: always revalidate with the server (Pages caches 10 min), fall back to the saved copy offline
    e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
    return;
  }
  // map tiles you have looked at stay available offline
  // vector map (style, tiles, fonts, sprites): the style refreshes when online, everything else is kept for offline use
  if(u.hostname==='tiles.openfreemap.org'){
    if(/\/styles\/|\/planet$/.test(u.pathname)){e.respondWith(caches.open(TILES).then(c=>fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>c.match(e.request).then(h=>h||new Response('',{status:504})))));return;}
    e.respondWith(caches.open(TILES).then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>new Response('',{status:504})))));
    return;
  }
  if(u.hostname==='tile.openstreetmap.org'){
    e.respondWith(caches.open(TILES).then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok&&(r.headers.get('content-type')||'').startsWith('image/'))c.put(e.request,r.clone());return r;}).catch(()=>new Response('',{status:504})))));
    return;
  }
  if(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(u.hostname)){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put(e.request,c));return r;})));
  }
});
