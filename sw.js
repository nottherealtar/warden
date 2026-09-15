self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('warden-v1').then((c) => c.addAll(['./','./index.html','./styles.css','./app.js','./maps/index.json']).catch(()=>{})));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
