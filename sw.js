// Blueprint service worker. Network first, so updates always arrive; the cache is only a fallback for offline.
const VERSION = '20261030f';
const CACHE = 'blueprint-' + VERSION;
const SHELL = ['./', 'index.html', 'terms.html', 'privacy.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('blueprint-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request, url = new URL(r.url);
  if (r.method !== 'GET' || r.headers.has('range')) return;            // videos and uploads go straight to the network
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net';                        // pinned library versions
  if (!sameOrigin && !cdn) return;                                        // Supabase, storage, realtime: never cached
  e.respondWith((async () => {
    try {
      const res = await fetch(r, sameOrigin ? { cache: 'no-cache' } : undefined);
      if (res && res.status === 200) { const c = await caches.open(CACHE); c.put(r, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(r, { ignoreSearch: false });
      if (hit) return hit;
      if (r.mode === 'navigate') return (await caches.match('index.html')) || (await caches.match('./'));
      return Response.error();
    }
  })());
});

// ---------- Phone alerts ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (x) { d = { title: 'Blueprint', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Blueprint', {
    body: d.body || '', icon: 'icon-192.png', badge: 'favicon-48.png', tag: d.tag || undefined, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'open', url }); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
