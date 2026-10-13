// Raydium pools for a mint, using the same public API v3 host and route the Raydium SDK uses
// (Blockchains/raydium-sdk-V2 src/api/url.ts: BASE_HOST + POOL_SEARCH_MINT). Keyless, CORS-enabled.
import { fetchJson, num } from '../http.js';

export const RAYDIUM_API = { BASE_HOST: 'https://api-v3.raydium.io', POOL_SEARCH_MINT: '/pools/info/list-v2', MINT_INFO_ID: '/mint/ids' };
export const RAYDIUM_SDK_URLS_TS = 'https://raw.githubusercontent.com/Blockchains/raydium-sdk-V2/master/src/api/url.ts';

export function normaliseRaydiumPool(p, mint) {
  const isA = p.mintA?.address === mint; const other = isA ? p.mintB : p.mintA;
  return { id: p.id, type: p.type, quote: other?.symbol || null, quoteMint: other?.address || null, tvl: num(p.tvl), vol24: num(p.day?.volume), fee24: num(p.day?.volumeFee), apr24: num(p.day?.apr), feeRate: num(p.feeRate), burnPercent: p.burnPercent == null ? null : num(p.burnPercent), launchMigratePool: !!p.launchMigratePool, url: `https://raydium.io/swap/?inputMint=${other?.address || 'sol'}&outputMint=${mint}` };
}

/** All Raydium pools (AMM v4 / CPMM "Standard" and CLMM "Concentrated") where the mint trades, deepest first, with LP burn %. */
export async function raydiumPools(mint, { size = 100 } = {}, opts) {
  const d = await fetchJson('raydium', `${RAYDIUM_API.BASE_HOST}${RAYDIUM_API.POOL_SEARCH_MINT}?size=${size}&mint1=${mint}&sortField=liquidity&sortType=desc`, opts);
  const pools = (d?.data?.data || []).map((p) => normaliseRaydiumPool(p, mint));
  return summariseRaydium(pools);
}

/** TVL-weighted LP burn: share of Raydium liquidity whose LP tokens are burned (cannot be pulled). */
export function summariseRaydium(pools) {
  const tvl = pools.reduce((s, p) => s + (p.tvl || 0), 0);
  const burnedTvl = pools.reduce((s, p) => s + (p.tvl || 0) * ((p.burnPercent || 0) / 100), 0);
  return { count: pools.length, tvl, vol24: pools.reduce((s, p) => s + (p.vol24 || 0), 0), burnedPct: tvl ? +((burnedTvl / tvl) * 100).toFixed(2) : null, pools: pools.slice(0, 10) };
}
