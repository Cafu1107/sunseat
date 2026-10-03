// Sunseat service worker: uygulama kabuğu çevrimdışı açılır, daha önce bakılan rota ve hava verisi önbellekten gelir.
const VERSION = 'sunseat-v1.1.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/style.css', 'assets/favicon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/js/app.js', 'assets/js/badges.js', 'assets/js/cabin.js', 'assets/js/cars.js', 'assets/js/features.js',
  'assets/js/i18n.js', 'assets/js/model.js', 'assets/js/park.js', 'assets/js/render.js', 'assets/js/route.js',
  'assets/js/share.js', 'assets/js/sim.js', 'assets/js/sun.js', 'assets/js/tan.js', 'assets/js/weather.js',
];
const API_HOSTS = ['router.project-osrm.org', 'api.open-meteo.com', 'photon.komoot.io'];
const CDN_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const TILE_HOST = 'tile.openstreetmap.org';
const MAX_TILES = 400;
const MAX_API = 120;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION + '-shell').then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

// Önce önbellek, arkadan güncelle.
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

async function cacheFirst(req, name, max) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    c.put(req, res.clone());
    if (max) trim(name, max);
  }
  return res;
}

async function networkFirst(req, name, max) {
  const c = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) { c.put(req, res.clone()); trim(name, max); }
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req, VERSION + '-shell'));
  } else if (API_HOSTS.includes(url.hostname)) {
    e.respondWith(networkFirst(req, VERSION + '-api', MAX_API));
  } else if (url.hostname === TILE_HOST) {
    e.respondWith(cacheFirst(req, VERSION + '-tiles', MAX_TILES));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req, VERSION + '-cdn'));
  }
});
