/*
  TM Mobile — Service Worker (minimal, safe)
  -------------------------------------------
  Purpose: make the app installable on iOS/Android (PWA) and give a small
  offline safety net for the app shell ONLY.

  IMPORTANT: this SW deliberately does NOT cache or intercept any request
  that is not a same-origin static file (html/css/js/json/png/svg/font).
  Firebase Auth / Firestore traffic goes to googleapis.com and must always
  reach the real network directly, or login and data sync will break.
*/
const CACHE_NAME = 'tm-mobile-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(SHELL_FILES.map(function(url){
        return cache.add(url).catch(function(){ /* ignore missing files */ });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  const req = event.request;
  let url;
  try{ url = new URL(req.url); }catch(e){ return; }

  // Never touch cross-origin requests (Firebase, Google APIs, fonts CDN, Gemini, etc.)
  if(url.origin !== self.location.origin) return;
  // Never touch non-GET requests.
  if(req.method !== 'GET') return;

  // Network-first for the main HTML so users always get the latest app build;
  // fall back to cache only when fully offline.
  if(req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')){
    event.respondWith(
      fetch(req).then(function(res){
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        return res;
      }).catch(function(){ return caches.match(req).then(function(r){ return r || caches.match('./index.html'); }); })
    );
    return;
  }

  // Cache-first for static shell assets (icons, manifest).
  if(SHELL_FILES.some(function(f){ return url.pathname.endsWith(f.replace('./','/')); })){
    event.respondWith(
      caches.match(req).then(function(cached){
        return cached || fetch(req);
      })
    );
  }
});
