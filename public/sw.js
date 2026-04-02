// Service Worker mínimo - solo para PWA install
// Cache version: 2026-04-02-v1 - FIX LOADING STUCK
const CACHE_VERSION = '2026-04-02-v1';

self.addEventListener('install', () => {
  console.log('🔄 SW: Installing new version', CACHE_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('🔄 SW: Activating new version', CACHE_VERSION);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'CACHE_CLEARED', version: CACHE_VERSION });
        });
      })
  );
});

// NO interceptar requests - dejar que el browser los maneje normalmente.
// El SW existe SOLO para habilitar la instalación PWA.
// Antes hacíamos event.respondWith(fetch(...)) que colgaba la PWA
// si el fetch fallaba sin catch.
self.addEventListener('fetch', () => {
  // no-op: browser handles request natively
});
