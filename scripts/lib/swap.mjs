// Buy/Sell deep links to free, non-custodial swap UIs (no API, no keys, no server).
// Solana -> Jupiter; EVM -> Uniswap (or 1inch where Uniswap lacks the chain).
const SOL = 'So11111111111111111111111111111111111111112';
const UNI = { ethereum: 'mainnet', base: 'base', arbitrum: 'arbitrum', optimism: 'optimism', polygon: 'polygon', bsc: 'bnb', avalanche: 'avalanche', blast: 'blast' };
const ONEINCH = { linea: 59144, sonic: 146 };
const e = encodeURIComponent;

export function swapLinks(t) {
  const a = t?.address, ch = t?.chain;
  if (!a || !ch) return null;
  if (ch === 'solana') return { host: 'https://jup.ag', buy: `https://jup.ag/swap?sell=${SOL}&buy=${e(a)}`, sell: `https://jup.ag/swap?sell=${e(a)}&buy=${SOL}` };
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return null;
  if (UNI[ch]) { const b = `https://app.uniswap.org/swap?chain=${UNI[ch]}`; return { host: 'https://app.uniswap.org', buy: `${b}&inputCurrency=NATIVE&outputCurrency=${a}`, sell: `${b}&inputCurrency=${a}&outputCurrency=NATIVE` }; }
  if (ONEINCH[ch]) { const n = ONEINCH[ch], b = `https://app.1inch.io/swap?src=${n}:`; return { host: 'https://app.1inch.io', buy: `${b}ETH&dst=${n}:${a}`, sell: `${b}${a}&dst=${n}:ETH` }; }
  return null;
}

// Same element/class as the old Compare CTA (a.btn.ghost) so size/look are unchanged.
export function swapCta(t, R, esc) {
  const s = swapLinks(t);
  if (!s) return `<a class="btn ghost" href="${R}compare/?ids=${encodeURIComponent(t.id)}">Compare</a>`;
  return `<link rel="preconnect" href="${s.host}"><a class="btn ghost" data-swap="buy" href="${esc(s.buy)}" target="_blank" rel="nofollow noopener">Buy</a> <a class="btn ghost" data-swap="sell" href="${esc(s.sell)}" target="_blank" rel="nofollow noopener">Sell</a>`;
}
