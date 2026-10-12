// Data collection for the rankings product. Free, keyless public sources only:
// CoinGecko public API, DexScreener, GeckoTerminal, Blockchains forks on raw.githubusercontent.com
// (token-list, assets, phishing) and public RPCs (through scanToken). Rolling caches are carried from
// the previously deployed v1/state.json so each 30-minute build refreshes a slice and stays polite.
import { fetchJson } from '../../src/http.js';
import * as cg from '../../src/sources/coingecko.js';
import { tokenPairs, pairsForToken, topBoosts, latestBoosts, latestProfiles } from '../../src/sources/dexscreener.js';
import { trendingPools, newPools, tokenInfo as gtTokenInfo, GT_NETWORK } from '../../src/sources/geckoterminal.js';
import { loadDenyList, checkUrls } from '../../src/sources/phishing.js';
import { scanToken, SUPPORTED_CHAINS } from '../../src/scan.js';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
const DEX_CHAINS = ['solana', 'base', 'ethereum', 'bsc'];
const DAY = 864e5;

export function checksum(addr) {
  const a = addr.toLowerCase().replace(/^0x/, '');
  const h = bytesToHex(keccak_256(a));
  return '0x' + [...a].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}
// GeckoTerminal allows ~30 calls/min; on 429 wait and try once more.
async function politely(fn) { try { return await fn(); } catch (e) { if (!/429|busy/.test(e.message)) throw e; await sleep(env('GT_BACKOFF', 20000)); return fn(); } }
// 7-day hourly sparkline → every 4th point, 5 significant digits (keeps state.json and pages small).
const slimRow = (r) => ({ ...r, spark: r.spark ? r.spark.filter((_, i, a) => i % 4 === 0 || i === a.length - 1).map((x) => +Number(x).toPrecision(5)) : null });
export const tokenId = (chain, address) => `${chain}:${address}`;
export const tokenPath = (t) => (t.address ? `token/${t.chain}/${t.address}/` : `coin/${t.cg}/`);
const urlSafe = (a) => /^[A-Za-z0-9_-]{3,90}$/.test(a || '');

export async function collect({ prev = {}, log = console.error } = {}) {
  const now = Date.now();
  const errors = {};
  const tokens = new Map(); // id -> row
  const state = { pools: prev.pools || {}, gt: prev.gt || {}, scans: prev.scans || {}, assets: prev.assets || {}, cats: prev.cats || {}, platforms: prev.platforms || {}, firstSeen: prev.firstSeen || {} };
  const upsert = (id, patch) => { const t = tokens.get(id) || { id, sources: [] }; for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== null && k !== 'sources') t[k] = v; t.sources = [...new Set([...t.sources, ...(patch.sources || [])])]; tokens.set(id, t); return t; };

  // 1) CoinGecko meme universe (+ contract addresses).
  const cgRows = [];
  const pages = env('CG_PAGES', 4);
  for (let p = 1; p <= pages; p++) {
    try { cgRows.push(...(await cg.markets({ category: 'meme-token', page: p })).map(slimRow)); } catch (e) { errors[`coingecko:markets:${p}`] = e.message; }
    await sleep(env('CG_SLEEP', 7000));
  }
  try { const all = await cg.platforms(); state.platforms = all; } catch (e) { errors['coingecko:platforms'] = e.message; }
  // Categories: refresh a rotating slice each build, keep the rest from the last build.
  const slot = Math.floor(now / (30 * 60e3));
  const perBuild = env('CG_CATS_PER_BUILD', 6);
  const cats = cg.MEME_CATEGORIES.filter(([slug]) => slug !== 'meme-token');
  const due = cats.filter(([slug]) => !state.cats[slug]).concat(cats.filter((_, i) => i % Math.ceil(cats.length / perBuild) === slot % Math.ceil(cats.length / perBuild)));
  for (const [slug] of [...new Map(due.map((d) => [d[0], d])).values()].slice(0, perBuild)) {
    await sleep(env('CG_SLEEP', 7000));
    try { const rows = await cg.markets({ category: slug, page: 1 }); state.cats[slug] = { at: now, ids: rows.map((r) => r.cg), rows: rows.filter((r) => (r.mcap || 0) > 0).slice(0, 250).map(slimRow) }; } catch (e) { errors[`coingecko:cat:${slug}`] = e.message; }
  }
  const prevCg = new Map((prev.tokens || []).filter((t) => t.cg).map((t) => [t.cg, t]));
  const cgById = new Map();
  for (const r of cgRows) cgById.set(r.cg, r);
  for (const c of Object.values(state.cats)) for (const r of c.rows || []) if (!cgById.has(r.cg)) cgById.set(r.cg, r);
  if (!cgRows.length) for (const t of prevCg.values()) if (!cgById.has(t.cg)) cgById.set(t.cg, { ...t, stale: true });
  for (const r of cgById.values()) {
    if (!r.mcap && !r.vol24) continue;
    const pc = cg.primaryContract(state.platforms[r.cg]);
    const chain = pc && urlSafe(pc.address) ? pc.chain : null;
    const id = chain ? tokenId(chain, pc.address) : `coin:${r.cg}`;
    const { source, ...rest } = r;
    upsert(id, { ...rest, chain: chain || null, address: chain ? pc.address : null, contracts: pc?.all || null, sources: ['coingecko'] });
  }
  const catsOf = {};
  for (const [slug, c] of Object.entries(state.cats)) for (const cid of c.ids || []) (catsOf[cid] ||= []).push(slug);

  // 2) DEX-native discovery: GeckoTerminal trending + new pools, DexScreener boosts/profiles.
  const trending = []; const fresh = []; const boosted = [];
  for (const chain of DEX_CHAINS) {
    for (const [kind, fn, arr] of [['trending', trendingPools, trending], ['new', newPools, fresh]]) {
      try { const pools = await politely(() => fn(chain)); pools.forEach((p, i) => arr.push({ chain, address: p.base.address, rank: i, pool: p })); } catch (e) { errors[`geckoterminal:${kind}:${chain}`] = e.message; }
      await sleep(2200);
    }
  }
  try { for (const b of [...await topBoosts(), ...await latestBoosts()]) if (DEX_CHAINS.includes(b.chain)) boosted.push(b); } catch (e) { errors['dexscreener:boosts'] = e.message; }
  try { for (const b of await latestProfiles()) if (DEX_CHAINS.includes(b.chain)) fresh.push({ chain: b.chain, address: b.address, profile: b }); } catch (e) { errors['dexscreener:profiles'] = e.message; }
  // CoinGecko-listed coins that are NOT in a meme category (e.g. ENA, ONDO trending on DEXes) are excluded.
  const memeCg = new Set(cgById.keys());
  const nonMeme = new Set();
  for (const [id, plats] of Object.entries(state.platforms || {})) if (!memeCg.has(id)) for (const a of Object.values(plats || {})) if (a) nonMeme.add(String(a).toLowerCase());
  const dexCandidates = new Map();
  for (const x of [...trending, ...fresh, ...boosted]) {
    if (!x.address || !urlSafe(x.address) || nonMeme.has(x.address.toLowerCase())) continue;
    const address = /^0x/.test(x.address) ? x.address.toLowerCase() : x.address;
    dexCandidates.set(tokenId(x.chain, address), { chain: x.chain, address });
  }
  // Skip quote assets that show up as "base" in pools.
  const QUOTES = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0x4200000000000000000000000000000000000006', '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0xdac17f958d2ee523a2206206994597c13d831ec7', '0x55d398326f99059ff775485246999027b3197955']);
  for (const [id, c] of dexCandidates) if (!QUOTES.has(c.address) && !tokens.has(id)) upsert(id, { chain: c.chain, address: c.address, sources: ['dex'] });

  // 3) DexScreener enrichment (liquidity, pools, socials) for every contract token.
  const byChain = {};
  for (const t of tokens.values()) if (t.address && SUPPORTED_DS.has(t.chain)) (byChain[t.chain] ||= []).push(t);
  for (const [chain, list] of Object.entries(byChain)) {
    for (let i = 0; i < list.length; i += 30) {
      const batch = list.slice(i, i + 30);
      try {
        const pairs = await tokenPairs(chain, batch.map((t) => t.address), { retries: 2 });
        for (const t of batch) {
          const mine = pairs.filter((p) => same(p.base.address, t.address));
          if (!mine.length) continue;
          const top = mine[0];
          const liq = mine.reduce((s, p) => s + (p.liquidityUsd || 0), 0);
          const dvol = mine.reduce((s, p) => s + (p.volume24hUsd || 0), 0);
          const created = mine.map((p) => p.createdAt).filter(Boolean).sort()[0] || null;
          const tx = mine.reduce((s, p) => ({ buys: s.buys + (p.txns24h?.buys || 0), sells: s.sells + (p.txns24h?.sells || 0) }), { buys: 0, sells: 0 });
          const patch = { liq, dexVol24: dvol, pairsCount: mine.length, createdAt: created, txns24h: tx,
            pools: mine.slice(0, 8).map((p) => ({ dex: p.dex, pair: p.pair, url: p.url, quote: p.quote.symbol, liq: p.liquidityUsd, vol24: p.volume24hUsd, priceUsd: p.priceUsd, labels: p.labels, createdAt: p.createdAt })),
            dsImage: top.image, dsLinks: top.links, sources: ['dexscreener'] };
          if (!t.sources.includes('coingecko')) Object.assign(patch, { name: top.base.name, symbol: top.base.symbol, priceUsd: top.priceUsd, mcap: top.marketCapUsd ?? null, fdv: top.fdvUsd, vol24: dvol, ch1h: top.priceChange?.h1 ?? null, ch24h: top.priceChange?.h24 ?? null, ch6h: top.priceChange?.h6 ?? null });
          upsert(t.id, patch);
        }
      } catch (e) { errors[`dexscreener:tokens:${chain}:${i}`] = e.message; }
      await sleep(250);
    }
  }
  // 3b) Full pool list (all DEXes) per token — rolling, 6h TTL, biggest first. tokens/v1 only returns the top pool.
  const poolDue = [...tokens.values()].filter((t) => t.pools && now - (state.pools[t.id]?.at || 0) > 6 * 36e5).sort((a, b) => (b.mcap || b.liq || 0) - (a.mcap || a.liq || 0)).slice(0, env('POOLS_BUDGET', 200));
  for (const t of poolDue) {
    try {
      const mine = (await pairsForToken(t.chain, t.address, { retries: 1 })).filter((p) => same(p.base.address, t.address));
      state.pools[t.id] = { at: now, liq: mine.reduce((s, p) => s + (p.liquidityUsd || 0), 0), vol24: mine.reduce((s, p) => s + (p.volume24hUsd || 0), 0), count: mine.length,
        pools: mine.slice(0, 12).map((p) => ({ dex: p.dex, pair: p.pair, url: p.url, quote: p.quote.symbol, liq: p.liquidityUsd, vol24: p.volume24hUsd, priceUsd: p.priceUsd, labels: p.labels, createdAt: p.createdAt })) };
    } catch (e) { errors[`dexscreener:pairs:${t.id}`] = e.message.slice(0, 100); }
    await sleep(230);
  }
  for (const t of tokens.values()) {
    const p = state.pools[t.id];
    const med = (xs) => { const v = xs.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
    if (p && p.count && t.pools && !t.sources.includes('coingecko')) t.priceUsd = med(p.pools.slice(0, 5).map((x) => x.priceUsd)) ?? t.priceUsd;
    if (p && p.count && t.pools) Object.assign(t, { liq: p.liq, dexVol24: p.vol24, pairsCount: p.count, pools: p.pools, poolsAt: p.at, ...(t.sources.includes('coingecko') ? {} : { vol24: p.vol24 }) });
  }
  // DEX-only rows without any pair data are dropped.
  for (const [id, t] of tokens) if (!t.sources.includes('coingecko') && !t.pools) tokens.delete(id);

  // 4) Carry forward tokens seen in the last 14 days so their pages do not 404.
  for (const t of prev.tokens || []) {
    if (tokens.has(t.id)) continue;
    if (now - Date.parse(t.lastSeen || 0) < 14 * DAY) tokens.set(t.id, { ...t, stale: true });
  }
  for (const t of tokens.values()) {
    if (!t.stale) t.lastSeen = new Date(now).toISOString();
    state.firstSeen[t.id] ||= new Date(now).toISOString();
    t.firstSeen = state.firstSeen[t.id];
    t.cats = t.cg ? catsOf[t.cg] || [] : [];
    t.path = tokenPath(t);
  }

  // 5) GeckoTerminal token info (holders, authorities, socials) — rolling, 24h TTL.
  const gtBudget = env('GT_BUDGET', 60);
  const gtDue = [...tokens.values()].filter((t) => t.address && GT_NETWORK[t.chain] && !t.stale).sort((a, b) => (state.gt[a.id]?.at || 0) - (state.gt[b.id]?.at || 0) || (b.mcap || b.liq || 0) - (a.mcap || a.liq || 0)).filter((t) => now - (state.gt[t.id]?.at || 0) > DAY).slice(0, gtBudget);
  for (const t of gtDue) {
    try { const i = await politely(() => gtTokenInfo(t.chain, t.address, { retries: 0 })); state.gt[t.id] = { at: now, ...i }; } catch (e) { state.gt[t.id] = { at: now, error: e.message.slice(0, 120) }; }
    await sleep(env('GT_SLEEP', 2200));
  }
  // 6) Blockchains/assets (Trust Wallet fork) info.json for EVM tokens — rolling, 7d TTL.
  const twChain = { ethereum: 'ethereum', bsc: 'smartchain', base: 'base', arbitrum: 'arbitrum', polygon: 'polygon', avalanche: 'avalanchec' };
  const asDue = [...tokens.values()].filter((t) => twChain[t.chain] && !t.stale && now - (state.assets[t.id]?.at || 0) > 7 * DAY).sort((a, b) => (b.mcap || b.liq || 0) - (a.mcap || a.liq || 0)).slice(0, env('ASSETS_BUDGET', 80));
  await Promise.all(asDue.map(async (t, i) => {
    await sleep(i * 50);
    const url = `https://raw.githubusercontent.com/Blockchains/assets/master/blockchains/${twChain[t.chain]}/assets/${checksum(t.address)}/info.json`;
    try { const d = await fetchJson('assets', url, { retries: 0, timeoutMs: 15000 }); state.assets[t.id] = { at: now, website: d.website || null, links: (d.links || []).map((l) => ({ type: l.name, url: l.url })), status: d.status || null, tags: d.tags || [] }; }
    catch (e) { state.assets[t.id] = { at: now, missing: true }; }
  }));
  // 7) Blockchains/token-list (Solana Labs registry fork) — legacy registry metadata.
  let solList = null;
  try { const d = await fetchJson('token-list', 'https://raw.githubusercontent.com/Blockchains/token-list/main/src/tokens/solana.tokenlist.json', { retries: 1, timeoutMs: 60000 }); solList = new Map(d.tokens.filter((x) => x.chainId === 101).map((x) => [x.address, x])); } catch (e) { errors['token-list'] = e.message; }

  // 8) Merge socials + run the phishing deny-list over every website/social URL.
  let deny = null;
  try { deny = await loadDenyList(); state.phishingSize = deny.deny.size; } catch (e) { errors.phishing = e.message; }
  for (const t of tokens.values()) {
    const g = state.gt[t.id]; const a = state.assets[t.id]; const s = solList?.get(t.address);
    const links = [];
    for (const w of t.dsLinks?.websites || []) links.push({ type: 'website', url: w, src: 'dexscreener' });
    for (const x of t.dsLinks?.socials || []) links.push({ type: x.type, url: x.url, src: 'dexscreener' });
    for (const w of g?.websites || []) links.push({ type: 'website', url: w, src: 'geckoterminal' });
    if (g?.twitter) links.push({ type: 'twitter', url: `https://x.com/${g.twitter}`, src: 'geckoterminal' });
    if (g?.telegram) links.push({ type: 'telegram', url: `https://t.me/${g.telegram}`, src: 'geckoterminal' });
    if (g?.discord) links.push({ type: 'discord', url: g.discord, src: 'geckoterminal' });
    if (a?.website) links.push({ type: 'website', url: a.website, src: 'Blockchains/assets' });
    for (const l of a?.links || []) if (!/coinmarketcap|coingecko/.test(l.url)) links.push({ type: l.type === 'x' ? 'twitter' : l.type, url: l.url, src: 'Blockchains/assets' });
    if (s?.extensions?.website) links.push({ type: 'website', url: s.extensions.website, src: 'Blockchains/token-list' });
    if (s?.extensions?.twitter) links.push({ type: 'twitter', url: s.extensions.twitter, src: 'Blockchains/token-list' });
    const seen = new Set();
    t.links = links.filter((l) => /^https:\/\//.test(l.url || '') && !seen.has(l.url.replace(/\/$/, '').toLowerCase()) && seen.add(l.url.replace(/\/$/, '').toLowerCase())).slice(0, 10);
    t.legacyRegistry = s ? { symbol: s.symbol, tags: s.tags || [] } : null;
    if (deny) { const r = checkUrls(t.links.map((l) => l.url), deny); t.linkCheck = { checked: r.checked.length, flagged: r.flagged, list: 'Blockchains/phishing' }; }
    if (g && !g.error) t.gt = { holders: g.holders, mintAuthority: g.mintAuthority, freezeAuthority: g.freezeAuthority, honeypot: g.honeypot, gtScore: g.gtScore, devPct: g.devPct, at: g.at };
    t.image ||= t.dsImage || g?.image || (s?.logoURI ? s.logoURI.replace('solana-labs/token-list', 'Blockchains/token-list') : null);
    delete t.dsImage; delete t.dsLinks;
  }

  // 9) Safety scans — rolling, 24h TTL, biggest tokens first, then trending.
  const scanBudget = env('SCAN_BUDGET', 24);
  const trendIds = new Set(trending.map((x) => tokenId(x.chain, /^0x/.test(x.address) ? x.address.toLowerCase() : x.address)));
  const scanDue = [...tokens.values()].filter((t) => t.address && SUPPORTED_CHAINS.includes(t.chain) && !t.stale && now - Date.parse(state.scans[t.id]?.scannedAt || 0) > DAY)
    .sort((a, b) => (trendIds.has(b.id) - trendIds.has(a.id)) || (b.mcap || 0) - (a.mcap || 0) || (b.liq || 0) - (a.liq || 0)).slice(0, scanBudget);
  for (const t of scanDue) {
    try { const s = await scanToken({ address: t.address, chain: t.chain }); state.scans[t.id] = slimScan(s); } catch (e) { errors[`scan:${t.id}`] = e.message.slice(0, 120); }
    await sleep(800);
  }
  for (const t of tokens.values()) { const s = state.scans[t.id]; if (s) t.scan = { verdict: s.verdict, at: s.scannedAt }; }

  // Prune caches to the live universe.
  for (const k of ['gt', 'scans', 'assets', 'pools']) for (const id of Object.keys(state[k])) if (!tokens.has(id)) delete state[k][id];
  const live = new Set(state.platforms ? [...tokens.values()].map((t) => t.cg).filter(Boolean) : []);
  state.platforms = Object.fromEntries(Object.entries(state.platforms).filter(([id]) => live.has(id)));
  for (const id of Object.keys(state.firstSeen)) if (!tokens.has(id)) delete state.firstSeen[id];

  return { tokens: [...tokens.values()], trending: [...new Set([...trendIds])], boosted: boosted.map((b) => tokenId(b.chain, /^0x/.test(b.address) ? b.address.toLowerCase() : b.address)), state, errors, counts: { cg: cgRows.length, dex: dexCandidates.size, gtRefreshed: gtDue.length, assetsRefreshed: asDue.length, scansRun: scanDue.length } };
}

const SUPPORTED_DS = new Set(['solana', 'ethereum', 'base', 'bsc', 'arbitrum', 'polygon', 'avalanche', 'ton', 'tron', 'blast', 'sonic', 'abstract', 'hyperevm', 'optimism', 'linea', 'mantle', 'cronos', 'pulsechain', 'sui', 'aptos']);
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
export const slimScan = (s) => ({ chain: s.chain, address: s.address, verdict: s.verdict, verdictNote: s.verdictNote, policy: s.policy, token: s.token, checks: s.checks.map(({ id, label, status, value, source, hard, note }) => ({ id, label, status, value, source, hard: !!hard, ...(note ? { note } : {}) })), errors: s.errors, scannedAt: s.scannedAt });
