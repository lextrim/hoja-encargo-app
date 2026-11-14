/* Service worker: la app abre y funciona sin internet.
   - Página (HTML): primero la red, saltándose la caché del navegador (siempre la última versión); si no hay red en 4 s, la copia guardada.
   - Resto de archivos propios (iconos, manifest): primero la copia guardada.
   - La nube y demás servidores: no se tocan; sin red fallan y los cambios quedan «sin subir».
   Cada copia publicada (la normal y la de prueba, en una subcarpeta) tiene su propia caché y solo atiende
   lo de su carpeta: así, en el mismo navegador, una no pisa ni borra lo guardado por la otra. */
const VERSION = '20261114-092158';
const AMBITO = new URL(self.registration.scope).pathname;     // p. ej. /hoja-encargo-app/  o  /hoja-encargo-app/prueba/
const PREFIJO = 'hoja-encargo:' + AMBITO + ':';
const CACHE = PREFIJO + VERSION;
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith(PREFIJO) && k !== CACHE) || k.startsWith('hoja-encargo-'))   // versiones viejas de esta copia y el nombre antiguo
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const conTiempo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
// solo lo de esta carpeta: la página y sus archivos (con extensión). Una subcarpeta, se escriba con barra
// final o sin ella («…/prueba» o «…/prueba/»), es otra app con su propio service worker y no se toca.
const esMio = u => {
  if (u.origin !== self.location.origin || !u.pathname.startsWith(AMBITO)) return false;
  const resto = u.pathname.slice(AMBITO.length);
  return resto === '' || (!resto.includes('/') && resto.includes('.'));
};

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || !esMio(u)) return;
  if (req.mode === 'navigate' || req.destination === 'document'){
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        // «no-cache»: preguntar siempre al servidor si hay versión nueva (GitHub Pages deja la página
        // 10 min en la caché del navegador y, sin esto, una actualización tardaba ese tiempo en llegar)
        const res = await conTiempo(fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}), 4000);
        // una redirección no se puede devolver tal cual a una navegación (el navegador da ERR_FAILED): se reenvía
        if (res.redirected) return Response.redirect(res.url, 302);
        if (res.ok) cache.put(AMBITO, res.clone());
        return res;
      } catch {
        return (await cache.match(AMBITO)) || Response.error();
      }
    })());
    return;
  }
  e.respondWith(caches.match(req, {cacheName: CACHE}).then(hit => hit || fetch(req).then(res => {
    if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
