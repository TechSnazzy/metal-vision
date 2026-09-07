const CACHE = 'metal-vision-shell-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './channel.js', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('metal-vision-shell-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/data/')) return;
  if (!SHELL.some(path => new URL(path, self.registration.scope).pathname === url.pathname)) return;
  e.respondWith(fetch(e.request).then(response => {
    if(response.ok) {const copy = response.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(e.request,copy)));}
    return response;
  }).catch(() => caches.match(e.request)));
});
