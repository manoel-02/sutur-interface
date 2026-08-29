// Service worker Sutur — délibérément minimal. Ne met JAMAIS en cache le code
// applicatif (HTML/JS/CSS) : chaque requête passe directement par le réseau, pour
// qu'une correction déployée soit immédiatement visible, sans jamais rester bloqué
// sur une ancienne version à cause d'un cache silencieux. S'il existait auparavant
// une version de ce fichier qui mettait en cache plus agressivement, celle-ci la
// remplace et purge tout cache existant au premier chargement.

const CACHE_VERSION = 'sutur-v3-no-cache';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // active la nouvelle version immédiatement, sans attendre la fermeture de tous les onglets
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

// Aucune interception de fetch — chaque requête va directement au réseau, exactement
// comme si aucun service worker n'était présent. Le seul rôle de ce fichier est de
// purger un éventuel cache existant d'une version antérieure.
