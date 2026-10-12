// Offline shell + last-known data. Upstream API calls are network-only (never cached as truth).
const V = 'mm-__BUILD__';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'lib/index.js', 'lib/http.js', 'lib/scan.js', 'lib/radar.js', 'lib/checklist.js', 'lib/pnl.js', 'lib/portfolio.js', 'lib/sources/dexscreener.js', 'lib/sources/geckoterminal.js', 'lib/sources/rugcheck.js', 'lib/sources/goplus.js', 'lib/sources/honeypot.js', 'lib/sources/jupiter.js', 'lib/sources/solana-rpc.js', 'v1/index.json', 'v1/radar-solana.json', 'v1/radar-base.json'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network-first for data snapshots, cache-first for the shell
  if (u.pathname.includes('/v1/')) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((cc) => cc.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
  }
});
