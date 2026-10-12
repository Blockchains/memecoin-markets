// Offline: app shell + token index cached; pages are network-first with cached fallback; upstream APIs never cached.
const V = 'mm-__BUILD__';
const SHELL = ['./', 'site.css', 'site.js', 'favicon.svg', 'manifest.webmanifest', 'offline/', 'v1/tokens-index.json', 'tools/', 'tools/index.html', 'tools/style.css', 'tools/app.js', 'lib/index.js', 'lib/http.js', 'lib/scan.js', 'lib/radar.js', 'lib/checklist.js', 'lib/pnl.js', 'lib/portfolio.js', 'lib/sources/dexscreener.js', 'lib/sources/geckoterminal.js', 'lib/sources/rugcheck.js', 'lib/sources/goplus.js', 'lib/sources/honeypot.js', 'lib/sources/honeysim.js', 'lib/sources/jupiter.js', 'lib/sources/solana-rpc.js', 'lib/sources/coingecko.js', 'lib/sources/phishing.js', 'v1/index.json', 'v1/radar-solana.json', 'v1/radar-base.json', 'watchlist/', 'compare/', 'guides/', 'guides/uk-memecoin-tax/'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const html = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  if (html || u.pathname.includes('/v1/')) {
    // network-first; remember what was visited so it works offline later
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((cc) => cc.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || (html ? caches.match(new URL('offline/', self.registration.scope).href) : undefined))));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((res) => { if (res.ok && /\/(vendor|lib)\//.test(u.pathname)) { const c = res.clone(); caches.open(V).then((cc) => cc.put(e.request, c)); } return res; })));
  }
});
