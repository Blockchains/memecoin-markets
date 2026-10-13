// Jupiter public lite API (https://dev.jup.ag) — price v3, swap quote v1, tokens v2. CORS: allowed.
import { fetchJson, num } from '../http.js';

const BASE = 'https://lite-api.jup.ag';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** USD prices for up to 50 mints: { mint: { usdPrice, liquidity, priceChange24h } } */
export async function prices(mints, opts) {
  const ids = [...new Set(mints)].slice(0, 50).join(',');
  if (!ids) return {};
  const d = await fetchJson('jupiter', `${BASE}/price/v3?ids=${ids}`, opts);
  const out = {};
  for (const [k, v] of Object.entries(d || {})) out[k] = { usdPrice: num(v.usdPrice), liquidity: num(v.liquidity), priceChange24h: num(v.priceChange24h), decimals: v.decimals };
  return out;
}

/** ExactIn quote. amount is in base units (integer string). */
export async function quote(inputMint, outputMint, amount, slippageBps = 100, opts) {
  const d = await fetchJson('jupiter', `${BASE}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`, { retries: 1, ...opts });
  return { inAmount: d.inAmount, outAmount: d.outAmount, priceImpactPct: num(d.priceImpactPct) * 100, routes: (d.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean) };
}

/** Token metadata (name, symbol, decimals, dev, supply, organic score, audit flags). */
export async function tokenInfo(mint, opts) {
  const d = await fetchJson('jupiter', `${BASE}/tokens/v2/search?query=${encodeURIComponent(mint)}`, opts);
  const t = (d || []).find((x) => x.id === mint);
  if (!t) return null;
  return {
    source: 'jupiter',
    mint: t.id, name: t.name, symbol: t.symbol, decimals: num(t.decimals), icon: t.icon || null,
    dev: t.dev || null, holderCount: num(t.holderCount), totalSupply: num(t.totalSupply), circSupply: num(t.circSupply),
    tokenProgram: t.tokenProgram || null, launchpad: t.launchpad || null, graduatedAt: t.graduatedAt || null,
    organicScore: num(t.organicScore), organicScoreLabel: t.organicScoreLabel || null, verified: !!t.isVerified,
    audit: t.audit ? { mintAuthorityDisabled: t.audit.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: t.audit.freezeAuthorityDisabled ?? null, topHoldersPercentage: num(t.audit.topHoldersPercentage), devBalancePercentage: num(t.audit.devBalancePercentage), devMints: num(t.audit.devMints), devMigrations: num(t.audit.devMigrations) } : null,
    usdPrice: num(t.usdPrice), liquidity: num(t.liquidity), mcap: num(t.mcap),
  };
}

/**
 * Sellability probe: can `amountRaw` of the token be routed back to SOL, and at what impact?
 * Not a simulation of the token program (Solana has no transfer-tax honeypots unless Token-2022
 * transfer fees/hooks are set — those are checked from the mint account separately).
 */
export async function sellProbe(mint, amountRaw, opts) {
  try {
    const q = await quote(mint, SOL_MINT, amountRaw, 300, { retries: 3, ...opts });
    return { routable: BigInt(q.outAmount || '0') > 0n, priceImpactPct: q.priceImpactPct, routes: q.routes };
  } catch (e) {
    const m = String(e.message || e);
    // Only a definitive NO_ROUTES answer is a fail; rate limits/timeouts are 'unknown'.
    return /NO_ROUTES|No routes|not tradable|TOKEN_NOT_TRADABLE/i.test(m) ? { routable: false, error: 'No routes found (Jupiter)' } : { routable: null, error: m };
  }
}

/**
 * Sell-side depth: price impact of selling $usd worth of the token for USDC through Jupiter's router,
 * for each size in `sizes`. Read-only quote; no transaction is built. Needs the token USD price and decimals.
 */
export async function sellImpact(mint, { priceUsd, decimals, sizes = [1000, 10000] }, opts) {
  if (!priceUsd || decimals == null) throw new Error('sellImpact needs priceUsd and decimals');
  const out = [];
  for (const usd of sizes) {
    const raw = BigInt(Math.floor((usd / priceUsd) * 10 ** Math.min(decimals, 12))) * 10n ** BigInt(Math.max(0, decimals - 12));
    try {
      const q = await quote(mint, USDC_MINT, raw.toString(), 500, opts);
      const got = Number(q.outAmount) / 1e6;
      out.push({ usd, outUsdc: got, priceImpactPct: q.priceImpactPct, lossPct: Math.max(0, +(((usd - got) / usd) * 100).toFixed(3)), routes: [...new Set(q.routes)] });
    } catch (e) { out.push({ usd, error: String(e.message).slice(0, 120) }); }
  }
  return { mint, source: 'jupiter lite-api /swap/v1/quote (Blockchains/jupiter-quote-api-node schema)', sizes: out };
}
