// Copia locale del sito per usarlo anche senza rete (metro, aereo).
// Risponde subito dalla cache e intanto aggiorna la copia in background.
var VERSIONE = 'g26-v1';
var FILE = ['./', 'index.html', 'app.js', 'musica.js', 'dati.enc.json', 'chibi.svg', 'icon.svg', 'manifest.webmanifest', 'apple-touch-icon.png', 'icona-192.png', 'icona-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSIONE).then(function (c) { return c.addAll(FILE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (chiavi) {
    return Promise.all(chiavi.filter(function (k) { return k !== VERSIONE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var nostro = url.origin === location.origin;
  var font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!nostro && !font) return;
  e.respondWith(caches.open(VERSIONE).then(function (cache) {
    return cache.match(req, { ignoreSearch: nostro }).then(function (inCache) {
      var dallaRete = fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone());
        return r;
      }).catch(function () { return inCache; });
      return inCache || dallaRete;
    });
  }));
});
