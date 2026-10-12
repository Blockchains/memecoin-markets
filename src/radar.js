// New-pair radar: GeckoTerminal newest pools + DexScreener latest profiles/boosts, enriched by
// DexScreener pairs and (Solana) RugCheck summaries. Free endpoints only; no mempool access needed.
import { newPools } from './sources/geckoterminal.js';
import { latestBoosts, latestProfiles, tokenPairs } from './sources/dexscreener.js';
import { rugcheckSummary } from './sources/rugcheck.js';
import { POLICY } from './scan.js';

const settle = async (p) => { try { return { ok: true, value: await p }; } catch (e) { return { ok: false, error: String(e?.message || e) }; } };
const ageMin = (iso, now) => (iso ? Math.round((now - Date.parse(iso)) / 60000) : null);

/** Quick, cheap flags a radar row can show without a full scan. */
export function quickFlags(row) {
  const f = [];
  if (row.liquidityUsd != null && row.liquidityUsd < POLICY.deskLiquidityUsd) f.push('below desk liquidity bar');
  if (row.txns5m && row.txns5m.sells === 0 && row.txns5m.buys > 5) f.push('no sells in 5m');
  if (row.rugcheck?.risks?.some((r) => r.level === 'danger')) f.push('rugcheck danger');
  if (row.rugcheck && row.rugcheck.lpLockedPct != null && row.rugcheck.lpLockedPct < POLICY.warnLpLockedPct && row.dex !== 'pumpfun') f.push('LP mostly unlocked');
  return f;
}

/**
 * @param {{chain?:string, limit?:number, rugcheck?:number, now?:number}} [o]
 */
export async function radar(o = {}) {
  const chain = o.chain || 'solana';
  const limit = o.limit ?? 40;
  const now = o.now ?? Date.now();
  const [gt, prof, boost] = await Promise.all([settle(newPools(chain)), settle(latestProfiles()), settle(latestBoosts())]);
  const errors = {};
  if (!gt.ok) errors.geckoterminal = gt.error;
  if (!prof.ok) errors['dexscreener-profiles'] = prof.error;
  if (!boost.ok) errors['dexscreener-boosts'] = boost.error;

  const rows = new Map();
  for (const p of gt.ok ? gt.value : []) {
    if (!p.base.address) continue;
    rows.set(p.base.address, { address: p.base.address, symbol: p.base.symbol, name: p.base.name, dex: p.dex, pair: p.pair, priceUsd: p.priceUsd, liquidityUsd: p.liquidityUsd, fdvUsd: p.fdvUsd, volume24hUsd: p.volume24hUsd, txns5m: p.txns5m, createdAt: p.createdAt, via: ['geckoterminal:new_pools'] });
  }
  const dsTokens = [
    ...(prof.ok ? prof.value : []).filter((x) => x.chain === chain).map((x) => [x.address, 'dexscreener:profile']),
    ...(boost.ok ? boost.value : []).filter((x) => x.chain === chain).map((x) => [x.address, 'dexscreener:boost']),
  ];
  for (const [a, via] of dsTokens) {
    const r = rows.get(a) || { address: a, via: [] };
    if (!r.via.includes(via)) r.via.push(via);
    rows.set(a, r);
  }
  // Enrich DexScreener-only rows (and refresh gecko rows) with best pair, 30 per call.
  const need = [...rows.values()].filter((r) => r.liquidityUsd == null).map((r) => r.address);
  for (let i = 0; i < need.length && i < 90; i += 30) {
    const res = await settle(tokenPairs(chain, need.slice(i, i + 30)));
    if (!res.ok) { errors.dexscreener = res.error; continue; }
    for (const p of res.value) {
      const r = rows.get(p.base.address);
      if (!r || r.liquidityUsd != null) continue;
      Object.assign(r, { symbol: p.base.symbol, name: p.base.name, dex: p.dex, pair: p.pair, priceUsd: p.priceUsd, liquidityUsd: p.liquidityUsd, fdvUsd: p.fdvUsd, volume24hUsd: p.volume24hUsd, txns5m: p.txns5m, createdAt: p.createdAt, url: p.url });
    }
  }
  let list = [...rows.values()].map((r) => ({ ...r, ageMin: ageMin(r.createdAt, now) }));
  list.sort((a, b) => (a.ageMin ?? 1e9) - (b.ageMin ?? 1e9));
  list = list.slice(0, limit);
  if (chain === 'solana' && o.rugcheck) {
    const top = list.filter((r) => (r.liquidityUsd ?? 0) >= POLICY.deskLiquidityUsd).slice(0, o.rugcheck);
    for (const r of top) {
      const rc = await settle(rugcheckSummary(r.address));
      if (rc.ok) r.rugcheck = { score: rc.value.scoreNormalised, lpLockedPct: rc.value.lpLockedPct, risks: rc.value.risks.map((x) => ({ name: x.name, level: x.level })) };
    }
  }
  for (const r of list) r.flags = quickFlags(r);
  return { chain, generatedAt: new Date(now).toISOString(), count: list.length, policy: POLICY.id, errors, rows: list };
}
