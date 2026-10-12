// CoinGecko public API v3 — keyless public endpoints (no Demo/Pro key). CORS: *.
// Attribution required by CoinGecko's terms: every page that shows this data links "Data: CoinGecko".
// Keyless calls are rate limited (~5-15/min); callers must space requests.
import { fetchJson, num } from '../http.js';

const BASE = 'https://api.coingecko.com/api/v3';

/** CoinGecko asset-platform id -> chain id used across this repo (DexScreener ids). */
export const CG_PLATFORM = {
  solana: 'solana', ethereum: 'ethereum', base: 'base', 'binance-smart-chain': 'bsc', 'arbitrum-one': 'arbitrum',
  'polygon-pos': 'polygon', avalanche: 'avalanche', 'the-open-network': 'ton', tron: 'tron', blast: 'blast',
  sonic: 'sonic', abstract: 'abstract', 'hyperevm': 'hyperevm', 'optimistic-ethereum': 'optimism', linea: 'linea',
  mantle: 'mantle', cronos: 'cronos', pulsechain: 'pulsechain', sui: 'sui', aptos: 'aptos',
};
/** Order used to choose a token's primary chain when it is on several. */
export const CHAIN_PRIORITY = ['solana', 'ethereum', 'base', 'bsc', 'arbitrum', 'polygon', 'avalanche', 'ton', 'tron', 'blast', 'sonic', 'abstract', 'hyperevm', 'optimism', 'linea', 'mantle', 'cronos', 'pulsechain', 'sui', 'aptos'];

/** Meme categories surfaced as category pages (CoinGecko category ids). */
export const MEME_CATEGORIES = [
  ['meme-token', 'All memecoins'], ['solana-meme-coins', 'Solana memecoins'], ['base-meme-coins', 'Base memecoins'],
  ['dog-themed-coins', 'Dog-themed memecoins'], ['cat-themed-coins', 'Cat-themed memecoins'], ['frog-themed-coins', 'Frog-themed memecoins'],
  ['ai-meme-coins', 'AI memecoins'], ['pump-fun', 'Pump.fun ecosystem'], ['letsbonk-fun-ecosystem', 'BONK.fun ecosystem'],
  ['four-meme-ecosystem', 'Four.meme (BNB) memecoins'], ['elon-musk-inspired-coins', 'Elon Musk-inspired memecoins'], ['parody-meme-coins', 'Parody memecoins'],
  ['tron-meme', 'TRON memecoins'], ['ton-meme-coins', 'TON memecoins'], ['sui-meme', 'Sui memecoins'], ['bitcoin-meme', 'Bitcoin memecoins'],
  ['chinese-meme', 'Chinese memecoins'], ['country-themed-meme-coins', 'Country-themed memecoins'],
];

export function normaliseMarket(c) {
  return {
    source: 'coingecko', cg: c.id, symbol: String(c.symbol || '').toUpperCase(), name: c.name, image: c.image || null,
    priceUsd: num(c.current_price), mcap: num(c.market_cap), fdv: num(c.fully_diluted_valuation), vol24: num(c.total_volume),
    cgRank: num(c.market_cap_rank), ch1h: num(c.price_change_percentage_1h_in_currency), ch24h: num(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
    ch7d: num(c.price_change_percentage_7d_in_currency), ath: num(c.ath), athDate: c.ath_date || null, circ: num(c.circulating_supply), supply: num(c.total_supply),
    spark: c.sparkline_in_7d?.price || null, updated: c.last_updated || null,
  };
}

/** /coins/markets for a category (250 per page max). */
export async function markets({ category = 'meme-token', page = 1, perPage = 250, sparkline = true } = {}, opts) {
  const d = await fetchJson('coingecko', `${BASE}/coins/markets?vs_currency=usd&category=${encodeURIComponent(category)}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=${sparkline}&price_change_percentage=1h,24h,7d`, { retries: 1, timeoutMs: 30000, ...opts });
  return (d || []).map(normaliseMarket);
}

/** All coins with their contract address per platform: { id: { platform: address } }. One large call. */
export async function platforms(opts) {
  const d = await fetchJson('coingecko', `${BASE}/coins/list?include_platform=true`, { retries: 1, timeoutMs: 60000, ...opts });
  return Object.fromEntries((d || []).map((c) => [c.id, c.platforms || {}]));
}

/** Pick the primary (chain, address) for a coin from its platforms map; null if it has no supported contract. */
export function primaryContract(platformMap) {
  const byChain = {};
  for (const [p, addr] of Object.entries(platformMap || {})) if (addr && CG_PLATFORM[p]) byChain[CG_PLATFORM[p]] = String(addr).trim();
  for (const c of CHAIN_PRIORITY) if (byChain[c]) return { chain: c, address: /^0x[0-9a-fA-F]{40}$/.test(byChain[c]) ? byChain[c].toLowerCase() : byChain[c], all: byChain };
  return null;
}
