// Service worker: guarda la app en el equipo para que abra sin señal.
const VERSION = 'v2.2.0-beta.4';
const CACHE = 'cpodb-paccha-' + VERSION;
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const PRECACHE = ['./', 'index.html', 'config.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js'];
const OPTIONAL = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(PRECACHE.map(u => u.startsWith('http') ? u : new Request(u, { cache: 'reload' })));
    for (const u of OPTIONAL) { try { await c.add(new Request(u, { mode: 'no-cors' })); } catch (_) {} }
  }));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cpodb-paccha-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const lib = url.hostname === 'www.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com';
  if (!same && !lib) return; // Firestore y Auth van directo a la red
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  if (same && /\/(config\.js|manifest\.json)$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: same }).then(hit => hit || fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  })));
});
