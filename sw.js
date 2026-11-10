// Service Worker: Pallet Rush offline spielbar machen.
//
// Version kommt aus der Registrierung (sw.js?v=<VERSION aus js/version.js>).
// Neue Version => neue Registrierungs-URL => neuer Worker, neuer Cache, alte Caches werden gelöscht.
//
// Strategie:
// - Code (HTML, JS, CSS, Manifest): Netz zuerst (immer aktuell), offline aus dem Cache.
// - Bilder/Assets: Cache zuerst (schnell), fehlende werden nachgeladen und gespeichert.

const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const PREFIX = 'pallet-rush-';
const CACHE = PREFIX + VERSION;

const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'css/style.css',
  'js/main.js',
  'js/version.js',
  'js/i18n.js',
  'js/save.js',
  'js/audio.js',
  'js/core/constants.js',
  'js/core/model.js',
  'js/core/rng.js',
  'js/core/solver.js',
  'js/data/levels.js',
  'js/render/draw.js',
  'js/render/props.js',
  'js/render/vehicles.js',
  'js/render/view.js',
  'assets/logo.png',
  'assets/menu-bg3.jpg',
  'assets/win.png',
  'assets/lose.png',
  'assets/favicon-64.png',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/boosters/ramp.png',
  'assets/boosters/shuffle.png',
  'assets/boosters/crane.png',
  'assets/boosters/forklift.png',
  ...Array.from({ length: 10 }, (_, i) => `assets/worlds/w${i + 1}.webp`),
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Einzeln laden: eine fehlende Datei darf die Installation nicht scheitern lassen.
    await Promise.allSettled(CORE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    // Neue Version sofort übernehmen; Seite lädt beim nächsten Start die neuen Dateien.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isCode(url, req) {
  return req.mode === 'navigate' || /\.(js|css|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
}

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    // no-cache: beim Server nachfragen (ETag), damit Updates ohne HTTP-Cache-Verzögerung ankommen
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await c.match('index.html'));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(isCode(url, req) ? networkFirst(req) : cacheFirst(req));
});
