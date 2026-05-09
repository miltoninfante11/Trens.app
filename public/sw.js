// Service Worker mínimo - solo para PWA install
// Cache version: 2026-05-06-v3 - Force refresh after Stack-shop link fix
const CACHE_VERSION = '2026-05-06-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
      .then(() => self.clients.claim())
  );
});

// Fetch handler requerido por Chrome para instalar PWA.
// Network-only: pasa todo al network con fallback seguro.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Si falla el network, devolver respuesta vacía en vez de colgar
      if (event.request.mode === 'navigate') {
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="1"></head><body style="background:#000"></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      }
      return new Response('', { status: 408 });
    })
  );
});
