importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
importScripts('config.js');
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  if (p.notification) return; // webpush.notification is shown by the browser
  const d = p.data || {};
  self.registration.showNotification(d.title || '予約', { body: d.body || '', icon: 'reserve-icon.png', tag: d.tag || undefined, data: { url: 'reserve.html' } });
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) if (w.url.includes('reserve.html')) return w.focus(); return clients.openWindow('reserve.html'); }));
});
