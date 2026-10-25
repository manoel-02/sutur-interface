// Service worker Sutur — délibérément minimal. Ne met JAMAIS en cache le code
// applicatif (HTML/JS/CSS) : chaque requête passe directement par le réseau, pour
// qu'une correction déployée soit immédiatement visible, sans jamais rester bloqué
// sur une ancienne version à cause d'un cache silencieux. S'il existait auparavant
// une version de ce fichier qui mettait en cache plus agressivement, celle-ci la
// remplace et purge tout cache existant au premier chargement.

const CACHE_VERSION = 'sutur-v4-push';

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
// comme si aucun service worker n'était présent.

// ── Notifications push ──────────────────────────────────────────────────────
// Ce gestionnaire manquait entièrement. L'abonnement se créait, le serveur envoyait,
// et le navigateur jetait chaque message faute de quelqu'un pour l'afficher : les
// rappels et les briefs n'arrivaient donc jamais, alors que l'interface annonçait
// « notifications activées ». Pire, une promesse `userVisibleOnly` non tenue finit
// par faire révoquer l'abonnement par Chrome.

const DEFAULT_TITLE = 'Sutur';
const ICON = '/icon-192.png';
const BADGE = '/icon-96.png';

function readPayload(event) {
  // Le serveur envoie du JSON, mais une sonde de test peut envoyer du texte brut ou rien.
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (err) {
    try {
      return { body: event.data.text() };
    } catch (err2) {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const title = data.title || DEFAULT_TITLE;
  const options = {
    body: data.body || data.message || 'Tu as une nouvelle notification.',
    icon: data.icon || ICON,
    badge: BADGE,
    lang: 'fr',
    // Un rappel qui arrive pendant que le téléphone est dans la poche doit rester
    // visible dans le centre de notifications, pas disparaître tout seul.
    requireInteraction: data.priority === 'high',
    // Deux notifications du même sujet se remplacent au lieu de s'empiler.
    tag: data.tag || 'sutur',
    renotify: true,
    data: { url: data.url || '/', sentAt: Date.now() },
  };
  // waitUntil est obligatoire : sans lui, le navigateur peut arrêter le worker
  // avant que la notification soit affichée.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reprendre l'onglet Sutur déjà ouvert plutôt que d'en empiler un nouveau
      // à chaque notification.
      for (const client of windows) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (target !== '/' && 'navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Chrome fait tourner les clés d'abonnement : sans ré-enregistrement, les
// notifications s'arrêtent un jour sans prévenir ni erreur visible.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then((subscription) =>
        self.clients.matchAll({ includeUncontrolled: true }).then((windows) => {
          // La page détient le token ; c'est elle qui sait réenregistrer l'abonnement.
          for (const client of windows) {
            client.postMessage({ type: 'push-subscription-changed', subscription: subscription.toJSON() });
          }
        })
      )
      .catch(() => {})
  );
});
