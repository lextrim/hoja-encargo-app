/* Service worker: la app abre y funciona sin internet.
   - Página (HTML): primero la red, saltándose la caché del navegador (siempre la última versión); si no hay red en 4 s, la copia guardada.
   - Resto de archivos propios (iconos, manifest): primero la copia guardada.
   - Google (Drive, inicio de sesión): no se toca; sin red falla y los cambios quedan «sin subir». */
const VERSION = '20261109-184423';
const CACHE = 'hoja-encargo-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('hoja-encargo-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const conTiempo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;   // Google y demás: sin tocar
  if (req.mode === 'navigate' || req.destination === 'document'){
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        // «no-cache»: preguntar siempre al servidor si hay versión nueva (GitHub Pages deja la página
        // 10 min en la caché del navegador y, sin esto, una actualización tardaba ese tiempo en llegar)
        const res = await conTiempo(fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}), 4000);
        if (res.ok) cache.put('index.html', res.clone());
        return res;
      } catch {
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
