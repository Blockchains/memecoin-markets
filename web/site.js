// memecoin.markets client: watchlist, sorting, live prices, search, compare, token charts + live scans, offline.
// Progressive enhancement only — every page is complete static HTML without this file.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ROOT = document.querySelector('meta[name="mm-root"]')?.content || './';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const price = (n) => { if (n == null || !isFinite(n)) return '—'; if (n >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 4 }); if (n >= 0.0001) return '$' + Number(n).toPrecision(4).replace(/0+$/, ''); const [m, e] = n.toExponential(3).split('e-'); return '$0.0' + String(+e - 1).split('').map((d) => SUB[d]).join('') + m.replace('.', '').replace(/0+$/, ''); };
const usd = (n) => { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n); return a >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : a >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n.toFixed(0); };
const pct = (n) => (n == null || !isFinite(n) ? '<span class="muted">—</span>' : `<span class="${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 2)}%</span>`);
const getJSON = async (u, ms = 12000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };
const GT = { solana: 'solana', ethereum: 'eth', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum', polygon: 'polygon_pos', avalanche: 'avax', ton: 'ton', tron: 'tron', blast: 'blast', sonic: 'sonic', abstract: 'abstract', optimism: 'optimism', linea: 'linea', mantle: 'mantle', cronos: 'cro', pulsechain: 'pulsechain', hyperevm: 'hyperevm' };

// ---------- network + service worker ----------
const net = () => { const p = $('#net'); if (!p) return; p.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE'; p.classList.toggle('off', !navigator.onLine); };
addEventListener('online', net); addEventListener('offline', net); net();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register(ROOT + 'sw.js', { scope: ROOT }).catch(() => {});

// ---------- token index (lazy) ----------
let indexP;
const loadIndex = () => (indexP ||= getJSON(ROOT + 'v1/tokens-index.json').then((d) => d.tokens.map(([id, path, name, symbol, chain, address, image, priceUsd, mcap, ch24h, vol24, liq, rank, verdict]) => ({ id, path, name, symbol, chain, address, image, priceUsd, mcap, ch24h, vol24, liq, rank, verdict }))).catch(() => []));
function searchIndex(list, q, n = 8) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const score = (t) => { const s = (t.symbol || '').toLowerCase(); const nm = (t.name || '').toLowerCase(); const a = (t.address || '').toLowerCase();
    if (a && a === q) return 0; if (s === q) return 1; if (s.startsWith(q)) return 2; if (nm.startsWith(q)) return 3; if (nm.includes(q) || s.includes(q)) return 4; if (q.length > 5 && a.includes(q)) return 5; return 99; };
  return list.map((t) => [score(t), t]).filter(([s]) => s < 99).sort((a, b) => a[0] - b[0] || (a[1].rank || 1e9) - (b[1].rank || 1e9) || (b[1].liq || 0) - (a[1].liq || 0)).slice(0, n).map((x) => x[1]);
}
const img = (t, s = 20) => (t.image ? `<img class="tl" src="${esc(t.image)}" alt="" width="${s}" height="${s}" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tl tl-x">${esc((t.symbol || '?')[0])}</span>`);

// ---------- header search suggestions ----------
for (const form of $$('form.search')) {
  const input = $('input', form); const box = $('.sugg', form); let sel = -1;
  input.addEventListener('focus', loadIndex, { once: true });
  input.addEventListener('input', async () => {
    const res = searchIndex(await loadIndex(), input.value); sel = -1;
    box.hidden = !res.length;
    box.innerHTML = res.map((t) => `<a href="${ROOT}${esc(t.path)}">${img(t)}<b>${esc(t.symbol)}</b> <span class="muted">${esc(t.name)} · ${esc(t.chain || '')}</span><span class="muted small" style="margin-left:auto">${t.rank ? '#' + t.rank : ''}</span></a>`).join('');
  });
  input.addEventListener('keydown', (e) => { const a = $$('a', box); if (!a.length) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + a.length) % a.length; a.forEach((x, i) => x.classList.toggle('on', i === sel)); } if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); location.href = a[sel].href; } });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) box.hidden = true; });
}

// ---------- watchlist ----------
const WKEY = 'mm:watch';
const watched = () => { try { return JSON.parse(localStorage.getItem(WKEY) || '[]'); } catch { return []; } };
const setWatched = (l) => { localStorage.setItem(WKEY, JSON.stringify([...new Set(l)])); paintStars(); };
function paintStars() { const w = new Set(watched()); for (const b of $$('[data-star]')) { const on = w.has(b.dataset.star); b.classList.toggle('on', on); b.textContent = b.classList.contains('big') ? (on ? '★ Watching' : '☆ Watch') : on ? '★' : '☆'; b.setAttribute('aria-pressed', on); } }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-star]'); if (b) { e.preventDefault(); const id = b.dataset.star; const w = watched(); setWatched(w.includes(id) ? w.filter((x) => x !== id) : [...w, id]); if ($('#wl-out')) renderWatchlist(); }
  const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.copy); c.textContent = 'Copied'; setTimeout(() => (c.textContent = 'Copy'), 1200); }
});
paintStars();
addEventListener('storage', (e) => e.key === WKEY && paintStars());

// ---------- sortable tables ----------
for (const table of $$('table[data-sortable]')) {
  $$('thead th', table).forEach((th, col) => {
    if (['spark', 'name'].includes(th.dataset.k)) return;
    th.tabIndex = 0;
    const go = () => {
      const tb = table.tBodies[0]; const dir = th.dataset.dir === 'desc' ? 'asc' : 'desc';
      $$('th', table).forEach((x) => { x.removeAttribute('aria-sort'); delete x.dataset.dir; }); th.dataset.dir = dir; th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
      const val = (tr) => { const td = tr.children[col]; const v = td?.dataset.v; return v === undefined ? parseInt(td?.textContent, 10) || 0 : v === '' ? -Infinity : Number(v); };
      [...tb.rows].sort((a, b) => (dir === 'desc' ? val(b) - val(a) : val(a) - val(b))).forEach((r) => tb.appendChild(r));
    };
    th.addEventListener('click', go); th.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  });
}

// ---------- live prices (DexScreener, from the visitor's browser) ----------
async function dsTokens(chain, addrs) { const d = await getJSON(`https://api.dexscreener.com/tokens/v1/${chain}/${addrs.join(',')}`); return Array.isArray(d) ? d : []; }
function setCell(el, v, fmt) { if (!el || v == null || !isFinite(v)) return; const old = Number(el.dataset.v); el.dataset.v = v; el.innerHTML = fmt(v); if (isFinite(old) && old && v !== old) { el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(v > old ? 'flash-up' : 'flash-dn'); } }
async function liveRows() {
  if (document.hidden || !navigator.onLine) return;
  const rows = $$('table.rt tr[data-addr]').slice(0, 120); const by = {};
  for (const r of rows) (by[r.dataset.chain] ||= []).push(r);
  for (const [chain, rs] of Object.entries(by)) {
    for (let i = 0; i < rs.length; i += 30) {
      const part = rs.slice(i, i + 30);
      try {
        const pairs = await dsTokens(chain, [...new Set(part.map((r) => r.dataset.addr))]);
        const by2 = {}; for (const p of pairs) (by2[String(p.baseToken?.address).toLowerCase()] ||= []).push(p);
        for (const r of part) {
          const ps = (by2[r.dataset.addr.toLowerCase()] || []).sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0)).slice(0, 5); if (!ps.length) continue;
          const pr = ps.map((p) => Number(p.priceUsd)).filter((x) => x > 0).sort((x, y) => x - y); const m = pr[Math.floor((pr.length - 1) / 2)];
          const old = Number($('[data-live=price]', r)?.dataset.v); if (old > 0 && (m / old > 3 || old / m > 3)) continue; // ignore implausible jumps vs the snapshot
          setCell($('[data-live=price]', r), m, price); if (ps[0].priceChange?.h1 != null) setCell($('[data-live=ch1h]', r), ps[0].priceChange.h1, pct);
        }
      } catch { /* keep static values */ }
    }
  }
}
if ($('table.rt tr[data-addr]')) { const kick = () => liveRows(); setTimeout(kick, 1500); setInterval(kick, 60000); }

// ---------- watchlist page ----------
async function renderWatchlist() {
  const out = $('#wl-out'); const ids = watched(); const idx = await loadIndex(); const by = new Map(idx.map((t) => [t.id, t]));
  if (!ids.length) { out.innerHTML = '<p class="muted">Your watchlist is empty. Tap ☆ next to any token.</p>'; return; }
  out.innerHTML = `<div class="tw"><table class="rt" data-sortable><thead><tr><th>#</th><th>Name</th><th class="num">Price</th><th class="num">24h</th><th class="num">Market cap</th><th class="num">Liquidity</th><th>Scan</th></tr></thead><tbody>${ids.map((id) => { const t = by.get(id) || { id, name: id, path: null }; return `<tr data-id="${esc(id)}"${t.address ? ` data-chain="${esc(t.chain)}" data-addr="${esc(t.address)}"` : ''}><td class="rk"><button class="star" data-star="${esc(id)}">★</button>${t.rank || ''}</td><th scope="row" class="nm">${t.path ? `<a href="${ROOT}${esc(t.path)}">${img(t, 24)}<span>${esc(t.name)}</span> <span class="sym">${esc(t.symbol)}</span></a>` : esc(id)}</th><td class="num" data-live="price" data-v="${t.priceUsd ?? ''}">${price(t.priceUsd)}</td><td class="num" data-v="${t.ch24h ?? ''}">${pct(t.ch24h)}</td><td class="num">${usd(t.mcap)}</td><td class="num">${usd(t.liq)}</td><td>${t.verdict ? `<span class="v v-${esc(t.verdict)}">${esc(t.verdict)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  paintStars(); liveRows();
}
if ($('#wl-out')) {
  renderWatchlist();
  $('#wl-export').addEventListener('click', () => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify({ watchlist: watched() }, null, 1)], { type: 'application/json' })), download: 'memecoin-watchlist.json' }); a.click(); });
  $('#wl-import').addEventListener('change', async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); setWatched([...watched(), ...(d.watchlist || [])]); renderWatchlist(); } catch { alert('Not a watchlist file'); } });
}

// ---------- search page ----------
async function liveSearch(q) {
  const d = await getJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
  const seen = new Set(); const out = [];
  for (const p of d.pairs || []) { const a = p.baseToken?.address; const k = p.chainId + ':' + a; if (!a || seen.has(k)) continue; seen.add(k); out.push({ chain: p.chainId, address: /^0x/.test(a) ? a.toLowerCase() : a, symbol: p.baseToken.symbol, name: p.baseToken.name, liq: p.liquidity?.usd, priceUsd: Number(p.priceUsd), image: p.info?.imageUrl }); }
  return out.slice(0, 20);
}
if ($('#search-out')) {
  const q = new URLSearchParams(location.search).get('q') || ''; $('#sq').value = q;
  (async () => {
    const out = $('#search-out'); if (!q) return;
    const res = searchIndex(await loadIndex(), q, 50);
    out.innerHTML = res.length ? `<p>${res.length} tracked token(s)</p><ul class="guides">${res.map((t) => `<li><a href="${ROOT}${esc(t.path)}">${img(t)} <b>${esc(t.symbol)}</b> ${esc(t.name)}</a> <span class="muted small">${esc(t.chain || '')} · ${price(t.priceUsd)} · mcap ${usd(t.mcap)}</span></li>`).join('')}</ul>` : '<p class="muted">Not in the tracked list — searching DexScreener live…</p>';
    try { // full-text over guides/categories/chains (Pagefind, MIT, built at deploy time)
      const pf = await import(ROOT + 'pagefind/pagefind.js'); await pf.options({ baseUrl: new URL(ROOT, location.href).pathname });
      const r = await pf.search(q); const hits = await Promise.all(r.results.slice(0, 6).map((x) => x.data()));
      if (hits.length) out.insertAdjacentHTML('beforeend', `<h2>Guides &amp; pages</h2><ul class="guides">${hits.map((h) => `<li><a href="${esc(h.url)}"><b>${esc(h.meta?.title || h.url)}</b></a><br><span class="muted small">${h.excerpt}</span></li>`).join('')}</ul>`);
    } catch { /* no index offline */ }
    try { const live = (await liveSearch(q)).filter((x) => !res.some((t) => t.address === x.address)); if (live.length) out.insertAdjacentHTML('beforeend', `<h2>Live DEX results</h2><ul class="guides">${live.map((x) => `<li><a href="${ROOT}token/${esc(x.chain)}/${esc(x.address)}/">${img(x)} <b>${esc(x.symbol)}</b> ${esc(x.name)}</a> <span class="muted small">${esc(x.chain)} · ${price(x.priceUsd)} · liq ${usd(x.liq)}</span></li>`).join('')}</ul><p class="muted small">Untracked tokens open a live page (not indexed) with a safety scan.</p>`); } catch { /* offline */ }
  })();
}

// ---------- compare ----------
if ($('#cmp-out')) {
  const params = new URLSearchParams(location.search);
  let ids = (params.get('ids') || '').split(',').filter(Boolean).slice(0, 4);
  const draw = async () => {
    const idx = await loadIndex(); const by = new Map(idx.map((t) => [t.id, t]));
    if (!ids.length) ids = idx.filter((t) => t.rank).slice(0, 2).map((t) => t.id);
    history.replaceState(null, '', `?ids=${ids.map(encodeURIComponent).join(',')}`);
    const ts = ids.map((id) => by.get(id) || { id, name: id, symbol: id.split(':')[1]?.slice(0, 6) });
    const rows = [['Price', (t) => price(t.priceUsd)], ['Rank', (t) => (t.rank ? '#' + t.rank : '—')], ['Market cap', (t) => usd(t.mcap)], ['24h', (t) => pct(t.ch24h)], ['Volume 24h', (t) => usd(t.vol24)], ['DEX liquidity', (t) => usd(t.liq)], ['Liquidity / mcap', (t) => (t.liq && t.mcap ? ((t.liq / t.mcap) * 100).toFixed(2) + '%' : '—')], ['Chain', (t) => esc(t.chain || '—')], ['Safety scan', (t) => (t.verdict ? `<span class="v v-${esc(t.verdict)}">${esc(t.verdict)}</span>` : '—')]];
    $('#cmp-out').innerHTML = `<div class="tw"><table class="rt cmp"><thead><tr><th></th>${ts.map((t) => `<th>${t.path ? `<a href="${ROOT}${esc(t.path)}">${img(t)} ${esc(t.symbol)}</a>` : esc(t.symbol)} <button class="ghost copy" data-rm="${esc(t.id)}">×</button></th>`).join('')}</tr></thead><tbody>${rows.map(([k, f]) => `<tr><th scope="row">${k}</th>${ts.map((t) => `<td>${f(t)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  $('#cmp-out').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { ids = ids.filter((x) => x !== b.dataset.rm); draw(); } });
  $('#cmp-form').addEventListener('submit', async (e) => { e.preventDefault(); const [t] = searchIndex(await loadIndex(), $('#cmp-q').value, 1); if (t && !ids.includes(t.id)) { ids = [...ids, t.id].slice(-4); $('#cmp-q').value = ''; draw(); } });
  draw();
}

// ---------- token page ----------
const art = $('article.token') || $('#dyn-token');
if (art) tokenPage(art);
async function tokenPage(a) {
  const chain = a.dataset.chain; const addr = a.dataset.addr; let pool = a.dataset.pool;
  if (!addr) return;
  // live price + pools from DexScreener
  const refresh = async () => {
    try {
      const d = await getJSON(`https://api.dexscreener.com/token-pairs/v1/${chain}/${addr}`);
      const mine = (Array.isArray(d) ? d : []).filter((p) => String(p.baseToken?.address).toLowerCase() === addr.toLowerCase()).sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0));
      if (!mine.length) return null;
      const top = mine[0]; pool ||= top.pairAddress;
      // median of the 5 deepest pools: one mispriced pool cannot move the headline price
      const ps = mine.slice(0, 5).map((p) => Number(p.priceUsd)).filter((x) => x > 0).sort((x, y) => x - y);
      setCell($('.px[data-live=price]', a), ps[Math.floor((ps.length - 1) / 2)], price);
      const liq = mine.reduce((s, p) => s + (p.liquidity?.usd || 0), 0); const el = $('[data-live=liq]', a); if (el) el.textContent = usd(liq);
      return { top, mine };
    } catch { return null; }
  };
  const first = await refresh(); setInterval(() => !document.hidden && refresh(), 60000);
  if (a.id === 'dyn-token' && first) renderDyn(a, first);
  // interactive chart (TradingView Lightweight Charts, Apache-2.0, self-hosted)
  const chartEl = $('#chart');
  const drawChart = async (tf = 'hour', agg = 1) => {
    if (!pool || !GT[chain] || !chartEl) return;
    try {
      if (!window.LightweightCharts) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = ROOT + 'vendor/lightweight-charts.standalone.production.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const d = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${GT[chain]}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=300&currency=usd`);
      const list = (d?.data?.attributes?.ohlcv_list || []).slice().reverse();
      if (list.length < 2) return;
      const L = window.LightweightCharts; chartEl.innerHTML = '';
      const ch = L.createChart(chartEl, { height: 320, layout: { background: { color: 'transparent' }, textColor: '#8a96a8' }, grid: { vertLines: { color: '#1c2535' }, horzLines: { color: '#1c2535' } }, timeScale: { timeVisible: tf !== 'day' }, rightPriceScale: { borderColor: '#1c2535' } });
      const s = ch.addSeries(L.CandlestickSeries, { upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false, priceFormat: { type: 'price', precision: 10, minMove: 1e-10 } });
      s.setData(list.map(([t, o, h, l, c]) => ({ time: t, open: o, high: h, low: l, close: c })));
      const v = ch.addSeries(L.HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, color: 'rgba(34,211,238,.35)' });
      v.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      v.setData(list.map(([t, , , , , vol]) => ({ time: t, value: vol })));
      ch.timeScale().fitContent();
      chartEl.dataset.ready = '1';
    } catch { /* keep the static sparkline */ }
  };
  if (chartEl) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); drawChart(); } }); io.observe(chartEl);
    $$('[data-tf]', a.querySelector('.chart-card') || a).forEach((b) => b.tagName === 'BUTTON' && b.addEventListener('click', () => drawChart(b.dataset.tf, Number(b.dataset.agg))));
  }
  // holders live (GeckoTerminal) when the snapshot has none
  const hl = $('#holders-live');
  if (hl && !$('#holders .dist') && GT[chain]) {
    try { const d = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${GT[chain]}/tokens/${addr}/info`); const h = d?.data?.attributes?.holders; if (h?.count) { hl.innerHTML = `<p>${Number(h.count).toLocaleString('en-US')} holders <span class="muted small">(GeckoTerminal, live)</span></p><div class="dist">${Object.entries(h.distribution_percentage || {}).map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${Math.min(100, +v)}%"></i><b>${(+v).toFixed(1)}%</b></div>`).join('')}</div>`; const hc = $('[data-live=holders]', a); if (hc) hc.textContent = Number(h.count).toLocaleString('en-US'); } } catch { /* rate limited */ }
  }
  // live safety scan with the SDK (same code as the build)
  const btn = $('#live-scan');
  const runScan = async () => {
    const out = $('#live-scan-out'); btn.disabled = true; out.innerHTML = '<p class="muted">Scanning…</p>';
    try {
      const { scanToken } = await import(ROOT + 'lib/index.js');
      const s = await scanToken({ address: btn.dataset.addr, chain: btn.dataset.chain });
      out.innerHTML = `<p><span class="v v-${esc(s.verdict)}" data-live-verdict="${esc(s.verdict)}">${esc(s.verdict)}</span> <span class="muted small">live · ${s.ms} ms</span></p><div class="tw"><table class="checks"><tbody>${s.checks.map((c) => `<tr data-live-check="${esc(c.id)}"><td><span class="s s-${esc(c.status)}">${esc(c.status.toUpperCase())}</span></td><td>${esc(c.label)}</td><td class="mono small">${esc(c.value ?? '—')}</td><td class="muted small">${esc(c.source)}</td></tr>`).join('')}</tbody></table></div>${Object.keys(s.errors || {}).length ? `<p class="small err">Unavailable: ${esc(Object.keys(s.errors).join(', '))}</p>` : ''}`;
    } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; } finally { btn.disabled = false; }
  };
  if (btn) { btn.addEventListener('click', runScan); if (!$('#safety [data-verdict]')) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); runScan(); } }); io.observe(btn); } }
}

// ---------- 404: live page for any untracked token URL ----------
function renderDyn(a, { top, mine }) {
  const b = top.baseToken; document.title = `${b.name} (${b.symbol}) — live token page`;
  $('#dyn-head').innerHTML = `<h1>${esc(b.name)} <span class="sym">${esc(b.symbol)}</span></h1><p class="muted small">${esc(a.dataset.chain)} · <span class="mono">${esc(a.dataset.addr)}</span> · not in the tracked list yet</p><div class="px" data-live="price">${price(Number(top.priceUsd))}</div><dl class="stats"><div><dt>Market cap</dt><dd>${usd(top.marketCap)}</dd></div><div><dt>FDV</dt><dd>${usd(top.fdv)}</dd></div><div><dt>Liquidity</dt><dd data-live="liq">${usd(mine.reduce((s, p) => s + (p.liquidity?.usd || 0), 0))}</dd></div><div><dt>Volume 24h</dt><dd>${usd(mine.reduce((s, p) => s + (p.volume?.h24 || 0), 0))}</dd></div><div><dt>24h</dt><dd>${pct(top.priceChange?.h24)}</dd></div><div><dt>Pools</dt><dd>${mine.length}</dd></div></dl>`;
}
