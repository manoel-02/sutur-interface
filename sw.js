// sw.js — Service Worker Sutur
// Rôle : recevoir les notifications push envoyées par le serveur et les afficher
// avec l'avatar Sutur (comme une notification Instagram), pas une notif générique.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Sutur', body: event.data ? event.data.text() : 'Nouvelle notification' };
  }

  const title = data.title || 'Sutur';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',    // l'avatar affiché à côté de la notification
    badge: '/icon-96.png',                  // petite icône monochrome (barre de statut Android)
    tag: data.tag || 'sutur-' + Date.now(), // évite d'empiler des notifs identiques
    renotify: false,
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notification → ramène sur l'app déjà ouverte, ou en ouvre une nouvelle
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
