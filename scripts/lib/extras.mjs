// v0.3 enrichment from the memecoin repo forks (all keyless):
//   pump.fun bonding curves (Blockchains/pump-public-docs IDL + public RPC), Raydium pools + LP burn
//   (Blockchains/raydium-sdk-V2 API routes), Jupiter sell-side depth (Blockchains/jupiter-quote-api-node schema),
//   token-list coverage (Blockchains/tokenLists + Blockchains/default-token-list), scam address/domain lists
//   (Blockchains/scam-database + Blockchains/eth-phishing-detect) and SVG logos (Blockchains/web3icons).
import { mkdirSync, writeFileSync } from 'node:fs';
import { bondingCurves, pumpPools } from '../../src/sources/pumpfun.js';
import { raydiumPools } from '../../src/sources/raydium.js';
import { prices as jupPrices, sellImpact } from '../../src/sources/jupiter.js';
import { listCoverage, loadScamLists, checkScam, loadWeb3Icons, LIST_URLS, CHAIN_ID } from '../../src/sources/lists.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
const H = 36e5;

export async function enrichExtras(tokens, state, { OUT, overBudget = () => false } = {}) {
  const errors = {}; const ext = (state.ext ||= { raydium: {}, impact: {} }); ext.raydium ||= {}; ext.impact ||= {};
  const now = Date.now(); const live = tokens.filter((t) => !t.stale);
  const sol = live.filter((t) => t.chain === 'solana' && t.address);
  const counts = {};

  // 1) pump.fun bonding curves for every Solana token (one getMultipleAccounts per 99 mints).
  const curves = {};
  for (let i = 0; i < sol.length; i += 99) {
    try { const r = await bondingCurves(sol.slice(i, i + 99).map((t) => t.address)); Object.assign(curves, r.curves); } catch (e) { errors[`pumpfun:${i}`] = String(e.message).slice(0, 140); }
    await sleep(400);
  }
  for (const t of sol) if (curves[t.address]) t.pumpfun = curves[t.address];
  counts.pumpfunTokens = sol.filter((t) => t.pumpfun).length;

  // 1b) pump.fun board: live bonding-curve pools + graduated PumpSwap pools (GeckoTerminal) with curve state.
  const board = { curve: [], graduated: [] };
  try {
    const [cur, grad] = [await pumpPools('pump-fun'), (await sleep(2200), await pumpPools('pumpswap'))];
    const mints = [...new Set([...cur, ...grad].map((p) => p.base.address).filter(Boolean))];
    const r = mints.length ? await bondingCurves(mints) : { curves: {} };
    const row = (p) => ({ mint: p.base.address, symbol: p.base.symbol, name: p.base.name, pool: p.pair, priceUsd: p.priceUsd, liquidityUsd: p.liquidityUsd, fdvUsd: p.fdvUsd, mcapUsd: p.mcapUsd, volume24hUsd: p.volume24hUsd, ch1h: p.priceChange1h, ch24h: p.priceChange24h, createdAt: p.createdAt, curve: r.curves[p.base.address] || null });
    board.curve = cur.map(row); board.graduated = grad.map(row); board.idl = r.idl; board.initialRealTokenReserves = r.initialRealTokenReserves;
  } catch (e) { errors['pumpfun:board'] = String(e.message).slice(0, 140); }

  // 2) Raydium pools + TVL-weighted LP burn — rolling, 12h TTL.
  const rayDue = sol.filter((t) => now - (ext.raydium[t.id]?.at || 0) > 12 * H).sort((a, b) => (b.mcap || b.liq || 0) - (a.mcap || a.liq || 0)).slice(0, env('RAYDIUM_BUDGET', 80));
  for (const t of rayDue) {
    if (overBudget()) { errors.raydium = 'time budget'; break; }
    try { ext.raydium[t.id] = { at: now, ...(await raydiumPools(t.address, { size: 50 }, { retries: 1 })) }; ext.raydium[t.id].pools = ext.raydium[t.id].pools.slice(0, 6); } catch (e) { ext.raydium[t.id] = { at: now, error: String(e.message).slice(0, 120) }; }
    await sleep(300);
  }
  counts.raydiumRefreshed = rayDue.length;

  // 3) Jupiter sell depth ($1K / $10K into USDC) — rolling, 12h TTL; price + decimals from Jupiter price v3.
  const impDue = sol.filter((t) => (t.liq || 0) >= 20000 && now - (ext.impact[t.id]?.at || 0) > 12 * H).sort((a, b) => (b.mcap || b.liq || 0) - (a.mcap || a.liq || 0)).slice(0, env('IMPACT_BUDGET', 30));
  let px = {};
  for (let i = 0; i < impDue.length; i += 50) { try { Object.assign(px, await jupPrices(impDue.slice(i, i + 50).map((t) => t.address))); } catch (e) { errors['jupiter:prices'] = String(e.message).slice(0, 120); } }
  for (const t of impDue) {
    if (overBudget()) { errors.impact = 'time budget'; break; }
    const p = px[t.address]; if (!p?.usdPrice || p.decimals == null) { ext.impact[t.id] = { at: now, error: 'no Jupiter price' }; continue; }
    try { const r = await sellImpact(t.address, { priceUsd: p.usdPrice, decimals: p.decimals, sizes: [1000, 10000] }, { retries: 1 }); ext.impact[t.id] = { at: now, sizes: r.sizes }; } catch (e) { ext.impact[t.id] = { at: now, error: String(e.message).slice(0, 120) }; }
    await sleep(1100);
  }
  counts.impactRefreshed = impDue.length;
  for (const t of sol) { const r = ext.raydium[t.id]; if (r && !r.error) t.raydium = r; const m = ext.impact[t.id]; if (m && !m.error) t.sellImpact = m; }

  // 4) Token-list coverage for EVM tokens.
  const evmChains = [...new Set(live.filter((t) => CHAIN_ID[t.chain] && t.address).map((t) => t.chain))];
  const listMeta = {};
  for (const ch of evmChains) {
    try { const cov = await listCoverage(ch); listMeta[ch] = cov.lists; for (const t of live) if (t.chain === ch && t.address) { const v = cov.byAddress.get(t.address.toLowerCase()); t.lists = v ? v.sort() : []; } } catch (e) { errors[`tokenlists:${ch}`] = String(e.message).slice(0, 120); }
  }

  // 5) Scam address + domain lists over contract, pool and link addresses.
  try {
    const lists = await loadScamLists();
    for (const t of live) {
      const r = checkScam({ addresses: /^0x/.test(t.address || '') ? [t.address, ...(t.pools || []).map((p) => p.pair)] : [], urls: (t.links || []).map((l) => l.url) }, lists);
      t.scamCheck = { ...r, lists: ['Blockchains/scam-database', 'Blockchains/eth-phishing-detect'] };
    }
    counts.scamAddresses = lists.addresses.size; counts.scamDomains = lists.scamDomains.size + lists.metamaskDeny.size;
    counts.scamFlagged = live.filter((t) => t.scamCheck.addressHits.length || t.scamCheck.domainHits.length).length;
  } catch (e) { errors.scamlists = String(e.message).slice(0, 120); }

  // 6) web3icons SVG logos, self-hosted under /logos/{coingecko-id}.svg (raw GitHub serves text/plain).
  try {
    const icons = await loadWeb3Icons();
    const want = live.filter((t) => t.cg && icons.has(t.cg));
    mkdirSync(`${OUT}/logos`, { recursive: true });
    await Promise.all(want.map(async (t, i) => {
      await sleep(i * 30);
      const ic = icons.get(t.cg); const variant = ic.variants.includes('branded') ? 'branded' : ic.variants[0];
      try { const r = await fetch(LIST_URLS.web3iconSvg(ic.file, variant), { signal: AbortSignal.timeout(15000) }); const s = await r.text(); if (r.ok && s.trim().startsWith('<svg')) { writeFileSync(`${OUT}/logos/${t.cg}.svg`, s); t.logoSvg = `logos/${t.cg}.svg`; } } catch { /* skip */ }
    }));
    counts.svgLogos = live.filter((t) => t.logoSvg).length;
  } catch (e) { errors.web3icons = String(e.message).slice(0, 120); }

  for (const id of Object.keys(ext.raydium)) if (!tokens.some((t) => t.id === id)) delete ext.raydium[id];
  for (const id of Object.keys(ext.impact)) if (!tokens.some((t) => t.id === id)) delete ext.impact[id];
  return { board, listMeta, counts, errors };
}
