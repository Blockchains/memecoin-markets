// Build the Pages site: CMC-style memecoin rankings (static HTML per token) + toolkit (/tools/)
// + SDK as ESM under /lib + JSON API under /v1. Run by GitHub Actions on push and every 30 minutes.
// Free public data only; rolling caches are carried over from the previously deployed v1/state.json.
import { readdirSync, cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { radar, scanToken, POLICY, LAUNCH_ITEMS } from '../src/index.js';
import { latestBoosts, topBoosts } from '../src/sources/dexscreener.js';
import { MEME_CATEGORIES } from '../src/sources/coingecko.js';
import { collect, slimScan } from './lib/collect.mjs';
import { buildData, writePages, seoFiles } from './lib/pages.mjs';
import { layout } from './lib/render.mjs';
import { enrichExtras } from './lib/extras.mjs';
import { writeExtPages } from './lib/ext-pages.mjs';

// IndexNow ownership key: public by design (served at /<key>.txt), not a secret.
const INDEXNOW_KEY = readdirSync('web').find((f) => /^[0-9a-f]{32}\.txt$/.test(f))?.slice(0, 32);
const OUT = process.env.OUT || '_site';
const PAGES = 'https://blockchains.github.io/memecoin-markets/';
const OFFLINE = process.env.OFFLINE === '1';
const pkg = JSON.parse(readFileSync('package.json'));
const now = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

// Canonical host: memecoin.markets once it serves this build (it publishes the same mm-origin.json), else Pages.
async function detectSite() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/?$/, '/');
  if (OFFLINE) return PAGES;
  try { const r = await fetch('https://memecoin.markets/mm-origin.json', { signal: AbortSignal.timeout(8000) }); const d = await r.json(); if (d.repo === 'Blockchains/memecoin-markets') return 'https://memecoin.markets/'; } catch { /* not pointed yet */ }
  return PAGES;
}
const site = await detectSite();
const c = { site, built: now, gsc: process.env.GSC_VERIFICATION || '' };

let prev = {};
if (process.env.PREV_STATE_FILE && existsSync(process.env.PREV_STATE_FILE)) prev = JSON.parse(readFileSync(process.env.PREV_STATE_FILE, 'utf8'));
else if (!OFFLINE) { try { const r = await fetch(PAGES + 'v1/state.json', { signal: AbortSignal.timeout(30000) }); if (r.ok) prev = await r.json(); } catch { /* first build */ } }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/v1/token`, { recursive: true });
cpSync('web', OUT, { recursive: true });
cpSync('src', `${OUT}/lib`, { recursive: true });
mkdirSync(`${OUT}/vendor`, { recursive: true });
cpSync('node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js', `${OUT}/vendor/lightweight-charts.standalone.production.js`);
cpSync('node_modules/lightweight-charts/LICENSE', `${OUT}/vendor/LIGHTWEIGHT-CHARTS-LICENSE.txt`);
for (const f of ['blocks.json', 'AGENTS.md']) cpSync(f, `${OUT}/${f}`);
writeFileSync(`${OUT}/sw.js`, readFileSync(`${OUT}/sw.js`, 'utf8').replace('__BUILD__', now.replace(/\D/g, '').slice(0, 14)));
writeFileSync(`${OUT}/tools/index.html`, readFileSync(`${OUT}/tools/index.html`, 'utf8').replaceAll('__SITE__', site));
writeFileSync(`${OUT}/.nojekyll`, '');
writeFileSync(`${OUT}/mm-origin.json`, JSON.stringify({ repo: 'Blockchains/memecoin-markets', built: now, canonical: site }));

const meta = { generated_at: now, version: pkg.version, policy: POLICY.id, site, built_by: 'Blockchain Lab — https://blockchainlab.com', repo: 'https://github.com/Blockchains/memecoin-markets', disclaimer: 'Evidence, not advice. Each figure names its upstream source.', attribution: 'Market data: CoinGecko (public API), DexScreener, GeckoTerminal' };
const write = (name, data) => { mkdirSync(`${OUT}/v1/${name}`.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(`${OUT}/v1/${name}`, JSON.stringify({ ...meta, ...data })); };
const errors = {};
write('policy.json', { policy: POLICY, launch_checklist: LAUNCH_ITEMS });

// ---- toolkit feeds (radar + boost scans) — consumed by the live desk on memecoin.markets ----
const radars = {};
for (const chain of ['solana', 'base']) {
  if (OFFLINE) radars[chain] = { chain, generatedAt: now, count: 0, rows: [], errors: { offline: 'build ran with OFFLINE=1' } };
  else try { radars[chain] = await radar({ chain, limit: 60, rugcheck: chain === 'solana' ? 8 : 0 }); } catch (e) { errors[`radar-${chain}`] = String(e.message); radars[chain] = { chain, generatedAt: now, count: 0, rows: [], errors: { radar: String(e.message) } }; }
  write(`radar-${chain}.json`, radars[chain]);
}
const scans = [];
if (!OFFLINE) {
  let boosts = []; let top = [];
  try { boosts = (await latestBoosts()).filter((b) => b.chain === 'solana').map((b) => b.address); } catch (e) { errors.boosts = String(e.message); }
  try { top = (await topBoosts()).filter((b) => b.chain === 'solana').map((b) => b.address); } catch (e) { errors.top_boosts = String(e.message); }
  const fresh = (radars.solana.rows || []).filter((r) => (r.liquidityUsd ?? 0) >= POLICY.deskLiquidityUsd).map((r) => r.address);
  const targets = [...new Set([...boosts.slice(0, 20), ...top.slice(0, 10), ...fresh.slice(0, 6)])].slice(0, Number(process.env.MAX_SCANS || 30));
  for (const address of targets) { try { scans.push(await scanToken({ address, chain: 'solana' })); } catch (e) { errors[`scan:${address}`] = String(e.message); } await sleep(1000); }
}
const slimDesk = (s) => ({ ...slimScan(s), market: s.market && { dex: s.market.dex, priceUsd: s.market.priceUsd, liquidityUsd: s.market.liquidityUsd, fdvUsd: s.market.fdvUsd, createdAt: s.market.createdAt, url: s.market.url } });
write('scans-solana.json', { count: scans.length, by_address: Object.fromEntries(scans.map((s) => [s.address, slimDesk(s)])) });

// ---- rankings product ----
const col = OFFLINE ? { tokens: prev.tokens || [], trending: prev.trending || [], boosted: prev.boosted || [], state: prev.state || { scans: {} }, errors: { offline: 'OFFLINE=1: reused previous state' }, counts: {} } : await collect({ prev: { ...(prev.state || {}), tokens: prev.tokens } });
Object.assign(errors, col.errors);
// v0.3: memecoin repo forks (pump.fun IDL, Raydium, Jupiter depth, token lists, scam lists, web3icons)
let ext = { board: prev.pumpfun || { curve: [], graduated: [] }, listMeta: {}, counts: {}, errors: {} };
if (!OFFLINE) { try { ext = await enrichExtras(col.tokens, col.state, { OUT, overBudget: () => Date.now() - t0 > Number(process.env.BUILD_BUDGET_MS || 22 * 60e3) }); } catch (e) { errors.extras = String(e.message).slice(0, 160); } }
Object.assign(errors, ext.errors);
for (const t of col.tokens) if (!t.image && t.logoSvg) t.image = site + t.logoSvg;
// desk scans also feed token pages
for (const s of scans) col.state.scans[`solana:${s.address}`] ||= slimScan(s);
for (const t of col.tokens) { const s = col.state.scans[t.id]; if (s) t.scan = { verdict: s.verdict, at: s.scannedAt }; }
let phishingSize = 0; try { phishingSize = prev.phishingSize || 0; } catch { /* */ }
const tokensPresent = new Set(col.tokens.map((t) => t.cats || []).flat());
const cats = MEME_CATEGORIES.filter(([s]) => s !== 'meme-token' && tokensPresent.has(s));
const d = buildData(col.tokens, { built: now, trending: col.trending, boosted: col.boosted, scans: col.state.scans, counts: col.counts, phishingSize: col.state.phishingSize || phishingSize, cats });
d.chains = Object.entries(d.tokens.filter((t) => t.chain && !t.stale).reduce((a, t) => ((a[t.chain] = (a[t.chain] || 0) + 1), a), {})).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
const { urls, tokenCount, pages } = writePages(OUT, c, d);
urls.push(['tools/', 0.6]);
const extPut = (path, html, { priority = 0.6 } = {}) => { mkdirSync(`${OUT}/${path}`, { recursive: true }); writeFileSync(`${OUT}/${path}index.html`, html); urls.push([path, priority]); };
const extOut = writeExtPages(extPut, c, d, ext);

// Offline + 404 pages
mkdirSync(`${OUT}/offline`, { recursive: true });
writeFileSync(`${OUT}/offline/index.html`, layout(c, { path: 'offline/', title: 'Offline — memecoin.markets', description: 'You are offline.', noindex: true, body: '<h1>You are offline</h1><p>Pages you opened before are available offline, along with your <a href="../watchlist/">watchlist</a>, the <a href="../tools/#pnl">UK tax calculator</a> and <a href="../guides/uk-memecoin-tax/">tax guide</a>. Prices will refresh when you reconnect.</p>' }));
const base404 = new URL(site).pathname; // "/memecoin-markets/" on Pages, "/" on the domain
writeFileSync(`${OUT}/404.html`, layout(c, { path: '', title: 'Page not found — memecoin.markets', description: 'Not found', noindex: true, body: `<div id="dyn-token" hidden></div><div id="dyn-head"><h1>Page not found</h1><p>Try the <a href="${base404}">rankings</a> or search above.</p></div><section class="card"><div id="chart" class="chart" hidden></div><div id="safety"><p><button id="live-scan" hidden>Run live scan</button></p><div id="live-scan-out"></div></div></section>
<script>(function(){var m=location.pathname.match(/\\/token\\/([a-z0-9-]+)\\/([A-Za-z0-9_-]{20,90})\\/?$/);if(!m)return;var a=document.getElementById('dyn-token');a.dataset.chain=m[1];a.dataset.addr=m[2];a.hidden=false;var b=document.getElementById('live-scan');b.hidden=false;b.dataset.chain=m[1];b.dataset.addr=m[2];document.getElementById('dyn-head').innerHTML='<h1>Loading '+m[2].slice(0,8)+'…</h1>';})();</script>` }).replace('<meta name="mm-root" content="./">', `<meta name="mm-root" content="${base404}">`).replace(/(href|src)="(?!https?:|#|\/)([^"]*)"/g, (x, k, v) => `${k}="${base404}${v.replace(/^\.\//, '')}"`));

// ---- JSON API ----
const slimTok = (t) => ({ id: t.id, path: t.path, url: site + t.path, name: t.name, symbol: t.symbol, chain: t.chain, address: t.address, cg: t.cg || null, image: t.image || null, rank: t.rank || null, priceUsd: t.priceUsd ?? null, mcap: t.mcap ?? null, fdv: t.fdv ?? null, vol24: t.vol24 ?? null, liq: t.liq ?? null, ch1h: t.ch1h ?? null, ch24h: t.ch24h ?? null, ch7d: t.ch7d ?? null, createdAt: t.createdAt || null, cats: t.cats || [], holders: t.gt?.holders?.count ?? null, top10Pct: t.gt?.holders?.dist?.top_10 ?? null, verdict: t.scan?.verdict || null, sources: t.sources });
write('markets.json', { count: d.ranked.length, rows: d.ranked.map(slimTok) });
write('tokens-index.json', { count: d.tokens.length, fields: ['id', 'path', 'name', 'symbol', 'chain', 'address', 'image', 'priceUsd', 'mcap', 'ch24h', 'vol24', 'liq', 'rank', 'verdict'], tokens: d.tokens.filter((t) => !t.stale || t.rank).map((t) => [t.id, t.path, t.name, t.symbol, t.chain, t.address, t.image || null, t.priceUsd ?? null, t.mcap ?? null, t.ch24h ?? null, t.vol24 ?? null, t.liq ?? null, t.rank || null, t.scan?.verdict || null]) });
write('trending.json', { rows: d.trendingRows.map(slimTok), boosted_paid: d.boostedRows.map(slimTok) });
write('new-pairs.json', { rows: d.fresh.map(slimTok) });
write('gainers.json', { rows: d.gainers.map(slimTok) });
write('losers.json', { rows: d.losers.map(slimTok) });
write('categories.json', { categories: cats.map(([slug, name]) => ({ slug, name, url: `${site}category/${slug}/`, ids: d.ranked.filter((t) => (t.cats || []).includes(slug)).map((t) => t.id) })) });
for (const t of d.tokens) if (t.address) write(`token/${t.chain}/${t.address}.json`, { token: { ...slimTok(t), pools: t.pools || [], links: t.links || [], linkCheck: t.linkCheck || null, holdersDist: t.gt?.holders || null, authorities: t.gt ? { mint: t.gt.mintAuthority, freeze: t.gt.freezeAuthority } : null, ath: t.ath ?? null, athDate: t.athDate || null, spark7d: t.spark || null, pumpfun: t.pumpfun || null, raydium: t.raydium || null, sellImpact: t.sellImpact || null, tokenLists: t.lists || null, scamCheck: t.scamCheck || null, logoSvg: t.logoSvg ? site + t.logoSvg : null }, scan: d.scans[t.id] || null });
const mini = (t) => ({ id: t.id, url: site + t.path, name: t.name, symbol: t.symbol, chain: t.chain, address: t.address, mcap: t.mcap ?? null, liq: t.liq ?? null });
write('pumpfun.json', { source: 'pump.fun bonding curves decoded on-chain with the IDL from Blockchains/pump-public-docs; pools from GeckoTerminal', idl: ext.board.idl || null, initialRealTokenReserves: ext.board.initialRealTokenReserves || null, curve: ext.board.curve, graduated: ext.board.graduated, ranked: extOut.ranked.map((t) => ({ ...mini(t), pumpfun: t.pumpfun })) });
write('sell-depth.json', { source: 'Jupiter lite API /swap/v1/quote (read-only), schema per Blockchains/jupiter-quote-api-node', rows: extOut.depth.map(({ t }) => ({ ...mini(t), sellImpact: t.sellImpact, raydium: t.raydium ? { count: t.raydium.count, tvl: t.raydium.tvl, burnedPct: t.raydium.burnedPct } : null })) });
write('token-lists.json', { lists: ext.listMeta, sources: ['Blockchains/tokenLists', 'Blockchains/default-token-list', 'Blockchains/scam-database', 'Blockchains/eth-phishing-detect'], flagged: extOut.flaggedRows.map((t) => ({ ...mini(t), scamCheck: t.scamCheck })), rows: extOut.listedRows.map((t) => ({ ...mini(t), lists: t.lists })) });
// Embeddable SVG safety badges (free, backlink-worthy): /badge/{chain}/{address}.svg
const BADGE_COL = { CLEAR: '#16a34a', DESK_PASS: '#65a30d', INCOMPLETE: '#ca8a04', FAIL: '#dc2626' };
const xmlEsc = (x) => String(x).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]);
let badges = 0;
for (const t of d.tokens) {
  if (!t.address || !/^[A-Za-z0-9]+$/.test(t.address)) continue;
  const v = d.scans[t.id]?.verdict || 'UNSCANNED'; const l = `${(t.symbol || 'token').slice(0, 12)} safety`; const w1 = 8 + l.length * 6.5; const w2 = 10 + v.length * 7;
  mkdirSync(`${OUT}/badge/${t.chain}`, { recursive: true });
  writeFileSync(`${OUT}/badge/${t.chain}/${t.address}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${w1 + w2}" height="20" role="img" aria-label="${xmlEsc(l)}: ${v}"><title>${xmlEsc(l)}: ${v} — memecoin.markets</title><rect width="${w1}" height="20" fill="#1f2937"/><rect x="${w1}" width="${w2}" height="20" fill="${BADGE_COL[v] || '#6b7280'}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="6" y="14">${xmlEsc(l)}</text><text x="${w1 + 5}" y="14">${v}</text></g></svg>`);
  badges++;
}
// state for the next build (rolling caches)
writeFileSync(`${OUT}/v1/state.json`, JSON.stringify({ generated_at: now, tokens: col.tokens.map(({ rank, ...t }) => t), trending: col.trending, boosted: col.boosted, state: col.state, pumpfun: ext.board }));

const endpoints = [
  ['v1/markets.json', 'All ranked memecoins (market cap order): price, mcap, FDV, volume, DEX liquidity, 1h/24h/7d change, holders, top-10 %, safety verdict'],
  ['v1/tokens-index.json', 'Compact index of every token page (search/watchlist)'],
  ['v1/token/{chain}/{address}.json', 'One token: market data, pools, links + phishing check, holders distribution, authorities, 7d sparkline and latest safety scan'],
  ['v1/trending.json', 'GeckoTerminal trending (organic) + DexScreener boosts (paid, labelled)'],
  ['v1/new-pairs.json', 'Pools created in the last 72h with ≥ $1K liquidity'],
  ['v1/gainers.json', 'Top 24h gainers (volume/liquidity filtered)'], ['v1/losers.json', 'Top 24h losers (volume/liquidity filtered)'],
  ['v1/categories.json', 'Meme categories with member token ids'],
  ['v1/radar-solana.json', 'Newest Solana pools (GeckoTerminal) + DexScreener profiles/boosts with quick flags'], ['v1/radar-base.json', 'Same radar for Base'],
  ['v1/scans-solana.json', 'Full safety scans for the latest + top DexScreener Solana boosts and the freshest liquid pools, keyed by mint'],
  ['v1/pumpfun.json', 'pump.fun: most-traded coins on the bonding curve + graduated PumpSwap coins, with on-chain curve progress (IDL from Blockchains/pump-public-docs)'],
  ['v1/sell-depth.json', 'Sell depth: % lost selling $1K / $10K of each liquid Solana memecoin into USDC (Jupiter quotes) + Raydium LP burn'],
  ['v1/token-lists.json', 'EVM token-list coverage (tokenlistooor, Uniswap default list) + ScamSniffer/MetaMask scam-list hits'],
  ['logos/{coingecko-id}.svg', 'Vector token logos from Blockchains/web3icons'],
  ['v1/policy.json', `Desk policy ${POLICY.id} thresholds and the launch checklist`],
  ['lib/index.js', 'The SDK as a browser ES module: import { scanToken, radar, ukCgt } from this URL'],
  ['sitemap.xml', 'Every indexable page'], ['llms.txt', 'Agent-readable summary'], ['llms-full.txt', 'Full agent-readable dump: guides + top 200 tokens'], ['badge/{chain}/{address}.svg', 'Embeddable SVG safety-verdict badge per token'], ['blocks.json', 'Blockchains building-block manifest'],
];
write('index.json', { endpoints: endpoints.map(([path, description]) => ({ path, url: `${site}${path}`, description })), counts: { ranked: d.ranked.length, tokenPages: tokenCount, rankingPages: pages, sitemapUrls: urls.length + 0 }, errors });
seoFiles(OUT, c, urls, d);
writeFileSync(`${OUT}/indexnow.json`, JSON.stringify({ key: INDEXNOW_KEY, keyLocation: `${site}${INDEXNOW_KEY}.txt`, host: new URL(site).host, urls: urls.filter((u) => u[2] !== false).map(([p]) => site + p) }));

// Full-text search index (Pagefind, MIT) over the generated HTML.
if (process.env.PAGEFIND !== '0') { try { execFileSync('npx', ['-y', 'pagefind', '--site', OUT, '--glob', '{guides,category,chain,methodology,about}/**/*.html'], { stdio: 'ignore', timeout: 120000 }); } catch (e) { errors.pagefind = String(e.message).slice(0, 120); } }

console.log(JSON.stringify({ out: OUT, site, ms: Date.now() - t0, ranked: d.ranked.length, tokenPages: tokenCount, sitemap: urls.length, trending: d.trendingRows.length, fresh: d.fresh.length, gainers: d.gainers.length, scans: Object.keys(col.state.scans).length, deskScans: scans.length, badges, counts: col.counts, ext: { ...ext.counts, pumpRanked: extOut.pumpRanked, depthRows: extOut.depthRows, listed: extOut.listed, flagged: extOut.flagged }, errors }, null, 1));
