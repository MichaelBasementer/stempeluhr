// Offline cache. Bump VERSION whenever app files change so phones pick up the update.
const VERSION = "stempeluhr-v12";
const FILES = ["./", "index.html", "style.css", "calc.js", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "lib/jspdf.umd.min.js", "fonts/instrument-sans.woff2", "fonts/azeret-mono.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates show up on the next start), cache as the offline fallback.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // GitHub Pages lets browsers keep files for 10 minutes; no-cache asks the server every time.
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
