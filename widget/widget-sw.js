// Service worker minimal pour le widget — juste suffisant pour que Chrome
// considère la page comme installable en PWA. Ne met rien en cache
// volontairement : les bulles ont besoin de données toujours fraîches
// (chat, lecture Spotify en cours), jamais d'une version périmée hors-ligne.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Laisse passer toutes les requêtes normalement — pas de mise en cache,
  // juste présent pour satisfaire les critères d'installabilité de Chrome.
  event.respondWith(fetch(event.request));
});
