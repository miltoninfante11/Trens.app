// Service Worker mínimo - solo para PWA install
// Cache version: 2026-01-04-v3 - FORCE UPDATE
const CACHE_VERSION = '2026-03-06-v1';

self.addEventListener('install', () => {
  console.log('🔄 SW: Installing new version', CACHE_VERSION);
  // Skip waiting to immediately become active
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('🔄 SW: Activating new version', CACHE_VERSION);
  // Clear ALL caches on activation
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        console.log('🗑️ SW: Found', cacheNames.length, 'caches to delete');
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('🗑️ SW: Deleting cache', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        console.log('✅ SW: All caches cleared, claiming clients');
        return self.clients.claim();
      })
      .then(() => {
        // Force refresh all open tabs
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        clients.forEach((client) => {
          console.log('🔄 SW: Reloading client', client.url);
          client.postMessage({ type: 'CACHE_CLEARED', version: CACHE_VERSION });
        });
      })
  );
});

// Pass all requests through to network - no caching
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
