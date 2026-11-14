/* Crock&Roll HQ · service worker: guarda la app para que abra rápido y funcione sin conexión.
   Sube el número de VERSION cada vez que publiques cambios para que los móviles se actualicen. */
const VERSION = 'crocknroll-v12';
const APP = ['./', './index.html', './nube.js', './manifest.json', './habitacion.webp', './espana.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const EXTERNOS = ['https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all([...APP, ...EXTERNOS].map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // la app: primero la red (para tener siempre lo último), si no hay conexión, la copia guardada
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
    return;
  }
  // tipografías y librerías: primero la copia guardada
  if (/fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com\/firebasejs|cdnjs\.cloudflare\.com/.test(url.href)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    })));
  }
  // el resto (base de datos, mapas, buscador) va directo a internet
});
