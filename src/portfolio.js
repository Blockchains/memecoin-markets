// Portfolio valuation: holdings -> Jupiter USD prices, optional GBP via the Chainlink GBP/USD
// block published by Blockchains/onetouchswitch-bridge. Wallet import needs an RPC that allows
// getTokenAccountsByOwner (api.mainnet-beta works server-side/Node; browsers need a user RPC).
import { prices } from './sources/jupiter.js';
import { solanaRpc, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from './sources/solana-rpc.js';
import { fetchJson } from './http.js';

export const GBP_USD_URL = 'https://blockchains.github.io/onetouchswitch-bridge/v1/gbp-usd.json';

export async function gbpUsd() {
  const d = await fetchJson('onetouchswitch-bridge', GBP_USD_URL, { retries: 1 });
  const e = d.ethereum || d.base || d;
  return { rate: Number(e.rate), updatedAt: e.updatedAt || e.updated_at || d.generated_at || null, source: 'Chainlink GBP/USD via Blockchains/onetouchswitch-bridge' };
}

/** holdings: [{mint, qty}] -> valued rows + totals */
export async function valuePortfolio(holdings, { gbp = false } = {}) {
  const px = await prices(holdings.map((h) => h.mint));
  const fx = gbp ? await gbpUsd().catch(() => null) : null;
  const rows = holdings.map((h) => {
    const p = px[h.mint];
    const usd = p?.usdPrice != null ? h.qty * p.usdPrice : null;
    return { ...h, usdPrice: p?.usdPrice ?? null, valueUsd: usd, valueGbp: usd != null && fx ? usd / fx.rate : null, change24hPct: p?.priceChange24h ?? null, liquidityUsd: p?.liquidity ?? null };
  });
  const totalUsd = rows.reduce((s, r) => s + (r.valueUsd || 0), 0);
  return { rows, totalUsd, totalGbp: fx ? totalUsd / fx.rate : null, gbpUsd: fx, pricedAt: new Date().toISOString() };
}

/** Read SPL + Token-2022 balances of a wallet. */
export async function walletHoldings(owner, { rpc = 'https://api.mainnet-beta.solana.com' } = {}) {
  const out = [];
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    const { result } = await solanaRpc('getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed' }], { rpc });
    for (const a of result?.value || []) {
      const info = a.account.data.parsed.info;
      const qty = Number(info.tokenAmount.uiAmountString);
      if (qty > 0) out.push({ mint: info.mint, qty });
    }
  }
  return out;
}
