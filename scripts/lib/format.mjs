// Formatting + HTML helpers shared by the static renderer (Node) — the browser has its own copy in web/site.js.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUB = '₀₁₂₃₄₅₆₇₈₉';
export function price(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 4 });
  if (n >= 0.0001) return '$' + n.toPrecision(4).replace(/0+$/, '');
  const s = n.toExponential(3); const [m, e] = s.split('e-'); const zeros = Number(e) - 1;
  return '$0.0' + String(zeros).split('').map((d) => SUB[d]).join('') + m.replace('.', '').replace(/0+$/, '');
}
export function usd(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}
export const usdFull = (n) => (n == null || !Number.isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
export const pct = (n) => (n == null || !Number.isFinite(n) ? '<span class="muted">—</span>' : `<span class="${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 2)}%</span>`);
export const num = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US'));
export const date = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
export const dateLong = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export function age(d, now = Date.now()) {
  if (!d) return '—';
  const m = (now - Date.parse(d)) / 6e4;
  if (m < 60) return Math.max(1, Math.round(m)) + 'm';
  if (m < 48 * 60) return Math.round(m / 60) + 'h';
  if (m < 60 * 24 * 365) return Math.round(m / 1440) + 'd';
  return (m / 525600).toFixed(1) + 'y';
}
/** Inline SVG sparkline (no JS, no image request — keeps LCP fast). */
export function spark(points, { w = 120, h = 36, cls = '' } = {}) {
  const p = (points || []).filter((x) => Number.isFinite(x));
  if (p.length < 3) return '';
  const step = Math.max(1, Math.floor(p.length / 56));
  const s = p.filter((_, i) => i % step === 0 || i === p.length - 1);
  const lo = Math.min(...s); const hi = Math.max(...s); const r = hi - lo || 1;
  const d = s.map((v, i) => `${((i / (s.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg preserveAspectRatio="none" class="spark ${s[s.length - 1] >= s[0] ? 'up' : 'dn'} ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${d}"/></svg>`;
}
export const CHAIN_NAME = { solana: 'Solana', ethereum: 'Ethereum', base: 'Base', bsc: 'BNB Chain', arbitrum: 'Arbitrum', polygon: 'Polygon', avalanche: 'Avalanche', ton: 'TON', tron: 'TRON', blast: 'Blast', sonic: 'Sonic', abstract: 'Abstract', hyperevm: 'HyperEVM', optimism: 'Optimism', linea: 'Linea', mantle: 'Mantle', cronos: 'Cronos', pulsechain: 'PulseChain', sui: 'Sui', aptos: 'Aptos' };
export const chainName = (c) => CHAIN_NAME[c] || (c ? c[0].toUpperCase() + c.slice(1) : 'Native chain');
export const EXPLORER = { solana: 'https://solscan.io/token/', ethereum: 'https://etherscan.io/token/', base: 'https://basescan.org/token/', bsc: 'https://bscscan.com/token/', arbitrum: 'https://arbiscan.io/token/', polygon: 'https://polygonscan.com/token/', avalanche: 'https://snowtrace.io/token/', ton: 'https://tonviewer.com/', tron: 'https://tronscan.org/#/token20/', blast: 'https://blastscan.io/token/', optimism: 'https://optimistic.etherscan.io/token/', linea: 'https://lineascan.build/token/', mantle: 'https://mantlescan.xyz/token/', cronos: 'https://cronoscan.com/token/', pulsechain: 'https://scan.pulsechain.com/token/', sonic: 'https://sonicscan.org/token/', abstract: 'https://abscan.org/token/', sui: 'https://suiscan.xyz/mainnet/coin/', aptos: 'https://explorer.aptoslabs.com/fungible_asset/' };
export const short = (a) => (a && a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a || '');
