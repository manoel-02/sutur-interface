// Sutur Service Worker — OrbixLabs v2.1
const CACHE = 'sutur-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Notification push reçue
self.addEventListener('push', e => {
  if(!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = {title:'Sutur', body: e.data.text()}; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Sutur', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'sutur-notif',
      renotify: true,
      data: { url: data.url || '/' }
    })
  );
});

// Clic sur la notification
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window'}).then(list => {
      if(list.length > 0) return list[0].focus();
      return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});
