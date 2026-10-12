// DexScreener public REST (https://docs.dexscreener.com/api/reference). CORS: *.
import { fetchJson, num } from '../http.js';

const BASE = 'https://api.dexscreener.com';

/** Normalise a DexScreener pair into the shape the scanner/radar use. */
export function normalisePair(p) {
  return {
    source: 'dexscreener',
    chain: p.chainId,
    dex: p.dexId,
    pair: p.pairAddress,
    url: p.url,
    base: { address: p.baseToken?.address, symbol: p.baseToken?.symbol, name: p.baseToken?.name },
    quote: { address: p.quoteToken?.address, symbol: p.quoteToken?.symbol },
    priceUsd: num(p.priceUsd),
    liquidityUsd: num(p.liquidity?.usd),
    fdvUsd: num(p.fdv),
    marketCapUsd: num(p.marketCap),
    volume24hUsd: num(p.volume?.h24),
    txns5m: p.txns?.m5 ? { buys: p.txns.m5.buys, sells: p.txns.m5.sells } : null,
    txns24h: p.txns?.h24 ? { buys: p.txns.h24.buys, sells: p.txns.h24.sells } : null,
    priceChange: p.priceChange || {},
    createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    labels: p.labels || [],
    socials: [...(p.info?.socials || []).map((s) => s.url || s.type), ...(p.info?.websites || []).map((w) => w.url)].filter(Boolean),
  };
}

/** All pairs for up to 30 token addresses on one chain, sorted by liquidity desc. */
export async function tokenPairs(chain, addresses, opts) {
  const list = (Array.isArray(addresses) ? addresses : [addresses]).slice(0, 30).join(',');
  const data = await fetchJson('dexscreener', `${BASE}/tokens/v1/${encodeURIComponent(chain)}/${list}`, opts);
  return (Array.isArray(data) ? data : data?.pairs || []).map(normalisePair).sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
}

/** Free-text search across chains. */
export async function search(q, opts) {
  const data = await fetchJson('dexscreener', `${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`, opts);
  return (data?.pairs || []).map(normalisePair);
}

/** Latest paid boosts (what the live desk calls BOOSTS). */
export async function latestBoosts(opts) {
  const data = await fetchJson('dexscreener', `${BASE}/token-boosts/latest/v1`, opts);
  return (data || []).map((b) => ({ chain: b.chainId, address: b.tokenAddress, amount: b.amount, totalAmount: b.totalAmount, url: b.url, description: b.description || null }));
}

/** Tokens with the most active boosts. */
export async function topBoosts(opts) {
  const data = await fetchJson('dexscreener', `${BASE}/token-boosts/top/v1`, opts);
  return (data || []).map((b) => ({ chain: b.chainId, address: b.tokenAddress, amount: b.amount, totalAmount: b.totalAmount, url: b.url, description: b.description || null }));
}

/** Latest token profiles (new listings with socials). */
export async function latestProfiles(opts) {
  const data = await fetchJson('dexscreener', `${BASE}/token-profiles/latest/v1`, opts);
  return (data || []).map((b) => ({ chain: b.chainId, address: b.tokenAddress, url: b.url, description: b.description || null, links: (b.links || []).map((l) => l.url) }));
}
