// GeckoTerminal public API v2 (https://www.geckoterminal.com/dex-api). ~30 req/min, CORS: *.
import { fetchJson, num } from '../http.js';

const BASE = 'https://api.geckoterminal.com/api/v2';
/** GeckoTerminal network ids for the chains we support. */
export const GT_NETWORK = { solana: 'solana', ethereum: 'eth', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum', polygon: 'polygon_pos', avalanche: 'avax', ton: 'ton', tron: 'tron', blast: 'blast', sonic: 'sonic', abstract: 'abstract', hyperevm: 'hyperevm', optimism: 'optimism', linea: 'linea', mantle: 'mantle', cronos: 'cro', pulsechain: 'pulsechain', sui: 'sui-network', aptos: 'aptos' };

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
    base: { address: tok.address || rest.join('_') || null, symbol: tok.symbol || (a.name || '').split(' / ')[0], name: tok.name || null },
    priceUsd: num(a.base_token_price_usd),
    liquidityUsd: num(a.reserve_in_usd),
    fdvUsd: num(a.fdv_usd),
    volume24hUsd: num(a.volume_usd?.h24),
    txns5m: { buys: t5.buys ?? null, sells: t5.sells ?? null, buyers: t5.buyers ?? null, sellers: t5.sellers ?? null },
    createdAt: a.pool_created_at || null,
    priceChange1h: num(a.price_change_percentage?.h1),
    priceChange24h: num(a.price_change_percentage?.h24),
    mcapUsd: num(a.market_cap_usd),
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

/** Token info: holders count + distribution, mint/freeze authority (Solana), socials, GT score. */
export async function tokenInfo(chain, address, opts) {
  const net = GT_NETWORK[chain] || chain;
  const d = await fetchJson('geckoterminal', `${BASE}/networks/${net}/tokens/${address}/info`, opts);
  const a = d?.data?.attributes || {};
  const h = a.holders || null;
  return {
    source: 'geckoterminal', address: a.address, name: a.name, symbol: a.symbol, image: a.image_url && a.image_url !== 'missing.png' ? a.image_url : null,
    cg: a.coingecko_coin_id || null, websites: a.websites || [], twitter: a.twitter_handle || null, telegram: a.telegram_handle || null, discord: a.discord_url || null,
    gtScore: num(a.gt_score), gtVerified: a.gt_verified ?? null,
    holders: h ? { count: num(h.count), dist: Object.fromEntries(Object.entries(h.distribution_percentage || {}).map(([k, v]) => [k, num(v)])), updated: h.last_updated || null } : null,
    mintAuthority: a.mint_authority ?? null, freezeAuthority: a.freeze_authority ?? null, honeypot: a.is_honeypot ?? null,
    dev: a.developer_address || null, devPct: num(a.developer_holding_percentage),
  };
}

/** OHLCV candles for a pool: [[ts, o, h, l, c, v], ...] oldest first. timeframe day|hour|minute. */
export async function ohlcv(chain, pool, { timeframe = 'hour', aggregate = 1, limit = 168 } = {}, opts) {
  const net = GT_NETWORK[chain] || chain;
  const d = await fetchJson('geckoterminal', `${BASE}/networks/${net}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`, opts);
  return (d?.data?.attributes?.ohlcv_list || []).slice().reverse();
}

/** Top pools on a network by 24h volume. */
export async function topPools(chain = 'solana', opts) {
  const net = GT_NETWORK[chain] || chain;
  const d = await fetchJson('geckoterminal', `${BASE}/networks/${net}/pools?sort=h24_volume_usd_desc&include=base_token,dex`, opts);
  return (d?.data || []).map((p) => normalisePool(p, d.included));
}
