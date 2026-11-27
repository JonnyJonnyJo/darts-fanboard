// Service Worker für die Web-App „Darts aktuell“
// - Seiten: immer zuerst frisch aus dem Netz (News bleiben aktuell), offline die zuletzt gesehene Fassung
// - Bilder, Schriften und Dateien mit ?v=…: aus dem Speicher (schnell), da sich ihr Name bei Änderungen ändert
// - Fremde Adressen (Supabase, Tippspiel-Login) werden nie angefasst
const CACHE = 'da-v1';
const START = ['/', '/manifest.webmanifest', '/img/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(START)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = (req, res) => {
  if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/admin') || url.pathname === '/track.js') return;

  // Seiten: Netz zuerst, offline aus dem Speicher (sonst Startseite)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => keep(req, res)).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('/'))));
    return;
  }

  // Versionierte Dateien, Bilder, Schriften: Speicher zuerst
  if (url.search.includes('v=') || /^\/(img|fonts|vendor)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => keep(req, res))));
    return;
  }

  // Alles andere (z. B. data/*.json): Netz zuerst, offline aus dem Speicher
  e.respondWith(fetch(req).then(res => keep(req, res)).catch(() => caches.match(req)));
});
