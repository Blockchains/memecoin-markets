// GeckoTerminal public API v2 (https://www.geckoterminal.com/dex-api). ~30 req/min, CORS: *.
import { fetchJson, num } from '../http.js';

const BASE = 'https://api.geckoterminal.com/api/v2';
/** GeckoTerminal network ids for the chains we support. */
export const GT_NETWORK = { solana: 'solana', ethereum: 'eth', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' };

export function normalisePool(pool, included = []) {
  const a = pool.attributes || {};
  const baseId = pool.relationships?.base_token?.data?.id;
  const dexId = pool.relationships?.dex?.data?.id;
  const tok = included.find((i) => i.id === baseId)?.attributes || {};
  const [network, ...rest] = String(baseId || '').split('_');
  const t5 = a.transactions?.m5 || {};
  return {
    source: 'geckoterminal',
    network,
    dex: dexId || null,
    pair: a.address,
    name: a.name,
    base: { address: rest.join('_') || tok.address || null, symbol: tok.symbol || (a.name || '').split(' / ')[0], name: tok.name || null },
    priceUsd: num(a.base_token_price_usd),
    liquidityUsd: num(a.reserve_in_usd),
    fdvUsd: num(a.fdv_usd),
    volume24hUsd: num(a.volume_usd?.h24),
    txns5m: { buys: t5.buys ?? null, sells: t5.sells ?? null, buyers: t5.buyers ?? null, sellers: t5.sellers ?? null },
    createdAt: a.pool_created_at || null,
    priceChange1h: num(a.price_change_percentage?.h1),
  };
}

/** Newest pools on a network (default Solana). */
export async function newPools(chain = 'solana', opts) {
  const net = GT_NETWORK[chain] || chain;
  const d = await fetchJson('geckoterminal', `${BASE}/networks/${net}/new_pools?include=base_token,dex`, opts);
  return (d?.data || []).map((p) => normalisePool(p, d.included));
}

/** Trending pools on a network. */
export async function trendingPools(chain = 'solana', opts) {
  const net = GT_NETWORK[chain] || chain;
  const d = await fetchJson('geckoterminal', `${BASE}/networks/${net}/trending_pools?include=base_token,dex`, opts);
  return (d?.data || []).map((p) => normalisePool(p, d.included));
}
