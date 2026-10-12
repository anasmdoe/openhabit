// OpenHabit service worker: app-shell caching for offline use, and Web Push
// reminders with Done / Snooze buttons.
// API calls are network-only; offline writes are queued by the app itself.
const VERSION = 'openhabit-v2';
const CORE = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // hashed build assets + fonts: cache-first
  if (url.pathname.startsWith('/assets/') || url.hostname.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then((hit) =>
        hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
      )
    );
    return;
  }

  // navigations: network-first, fall back to cached shell
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
  }
});

// ---- Web Push reminders ------------------------------------------------------
// Payload from reminder-service: { title, body, tag, url, actions: [{ action, title, url }] }
// where each action url is a signed, same-origin link (no login needed).
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const actions = Array.isArray(data.actions) ? data.actions : [];
  e.waitUntil(self.registration.showNotification(data.title || 'OpenHabit', {
    body: data.body || '',
    tag: data.tag,
    renotify: Boolean(data.tag),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    actions: actions.map(({ action, title }) => ({ action, title })),
    data: { url: data.url || '/', links: Object.fromEntries(actions.map((a) => [a.action, a.url])) },
  }));
});

self.addEventListener('notificationclick', (e) => {
  const { url = '/', links = {} } = e.notification.data || {};
  e.notification.close();
  const link = e.action && links[e.action];
  if (link) {
    // Done / Snooze: call the signed link; show the result only if it failed
    e.waitUntil(fetch(link, { method: 'POST' }).then(async (res) => {
      if (!res.ok) {
        await self.registration.showNotification('OpenHabit', { body: await res.text(), tag: 'openhabit-action' });
      } else {
        // let open app windows refresh their data
        const wins = await self.clients.matchAll({ type: 'window' });
        wins.forEach((w) => w.postMessage({ type: 'openhabit:refresh' }));
      }
    }).catch(() => self.registration.showNotification('OpenHabit', { body: 'Offline: open the app to check in.', tag: 'openhabit-action' })));
    return;
  }
  // body tap (or iOS, which shows no buttons): focus the app or open it
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    return win ? win.focus() : self.clients.openWindow(url);
  }));
});
