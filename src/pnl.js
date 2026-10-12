// PnL and UK Capital Gains matching for token trades.
// UK rules per HMRC Cryptoassets Manual CRYPTO22200+: same-day rule, then the 30-day
// "bed and breakfast" rule, then the Section 104 pool (average cost). Fees are allowable costs.
// Also: plain FIFO realised PnL, and export to rotki's "generic trades" CSV import
// (Blockchains/rotki fork: rotkehlchen/data_import/importers/rotki_trades.py).

const DAY = 86400000;
const r2 = (x) => Math.round(x * 100) / 100;

/** Normalise trade input. total = value in the reporting currency (GBP for UK) before fees. */
export function normaliseTrade(t, i = 0) {
  const time = t.time || t.date;
  const ts = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(time) ? `${time}T12:00:00Z` : time);
  if (!Number.isFinite(ts)) throw new Error(`trade ${i + 1}: bad time "${time}"`);
  const side = String(t.side || t.type || '').toLowerCase();
  if (!['buy', 'sell'].includes(side)) throw new Error(`trade ${i + 1}: side must be buy or sell`);
  const qty = Number(t.qty ?? t.amount);
  const total = Number(t.total ?? t.value);
  const fee = Number(t.fee || 0);
  if (!(qty > 0) || !(total >= 0) || !(fee >= 0)) throw new Error(`trade ${i + 1}: qty/total/fee must be positive numbers`);
  return { i, ts, day: new Date(ts).toISOString().slice(0, 10), side, asset: String(t.asset).trim(), qty, total, fee, quoteAsset: t.quoteAsset || null, quoteQty: t.quoteQty != null ? Number(t.quoteQty) : null, note: t.note || '' };
}

/** UK tax year label for a date, e.g. 2025-04-06 -> "2025/26". */
export function ukTaxYear(day) {
  const [y, m, d] = day.split('-').map(Number);
  const start = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}
/** Annual exempt amount for individuals (HMRC). */
export const UK_AEA = { '2020/21': 12300, '2021/22': 12300, '2022/23': 12300, '2023/24': 6000, '2024/25': 3000, '2025/26': 3000, '2026/27': 3000 };

export function ukCgt(trades) {
  const T = trades.map(normaliseTrade);
  const assets = [...new Set(T.map((t) => t.asset))];
  const disposals = [];
  const pools = {};
  const warnings = [];
  for (const asset of assets) {
    const days = new Map();
    for (const t of T.filter((x) => x.asset === asset)) {
      const d = days.get(t.day) || { day: t.day, bq: 0, bc: 0, sq: 0, sp: 0 };
      if (t.side === 'buy') { d.bq += t.qty; d.bc += t.total + t.fee; } else { d.sq += t.qty; d.sp += t.total - t.fee; }
      days.set(t.day, d);
    }
    const D = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    const rec = new Map(); // day -> disposal record
    const getRec = (d) => rec.get(d.day) || (rec.set(d.day, { asset, day: d.day, taxYear: ukTaxYear(d.day), qty: d.sq, proceeds: d.sp, cost: 0, matches: [] }), rec.get(d.day));
    const take = (d, q) => { const c = d.bc * (q / d.bq); d.bq -= q; d.bc -= c; return c; };
    const give = (d, q) => { const p = d.sp * (q / d.sq); d.sq -= q; d.sp -= p; return p; };
    // 1) same day
    for (const d of D) if (d.sq > 0 && d.bq > 0) {
      const q = Math.min(d.sq, d.bq); const r = getRec(d); const cost = take(d, q); give(d, q);
      r.cost += cost; r.matches.push({ rule: 'same-day', qty: q, cost, acquired: d.day });
    }
    // 2) bed & breakfast: acquisitions within 30 days after, earliest first
    for (const d of D) if (d.sq > 1e-12) {
      const t0 = Date.parse(d.day);
      for (const b of D) {
        if (d.sq <= 1e-12) break;
        const dt = Date.parse(b.day) - t0;
        if (dt <= 0 || dt > 30 * DAY || b.bq <= 1e-12) continue;
        const q = Math.min(d.sq, b.bq); const r = getRec(d); const cost = take(b, q); give(d, q);
        r.cost += cost; r.matches.push({ rule: 'bed-and-breakfast', qty: q, cost, acquired: b.day });
      }
    }
    // Restore original remaining proceeds bookkeeping: the S104 step works on what's left.
    let pq = 0; let pc = 0;
    for (const d of D) {
      if (d.bq > 1e-12) { pq += d.bq; pc += d.bc; d.bq = 0; d.bc = 0; }
      if (d.sq > 1e-12) {
        const r = getRec(d);
        const q = Math.min(d.sq, pq);
        if (q > 0) { const cost = pc * (q / pq); pq -= q; pc -= cost; r.cost += cost; r.matches.push({ rule: 's104', qty: q, cost, acquired: 'pool' }); }
        if (d.sq - q > 1e-9) { warnings.push(`${asset} ${d.day}: sold ${d.sq - q} more than held — missing buy history (cost treated as 0)`); r.matches.push({ rule: 'unmatched', qty: d.sq - q, cost: 0, acquired: null }); }
        d.sq = 0;
      }
    }
    pools[asset] = { qty: pq, cost: pc, avgCost: pq > 0 ? pc / pq : 0 };
    for (const r of rec.values()) disposals.push({ ...r, gain: r.proceeds - r.cost });
  }
  disposals.sort((a, b) => a.day.localeCompare(b.day));
  const years = {};
  for (const d of disposals) {
    const y = (years[d.taxYear] ||= { taxYear: d.taxYear, disposals: 0, proceeds: 0, costs: 0, gains: 0, losses: 0, net: 0, annualExemptAmount: UK_AEA[d.taxYear] ?? null });
    y.disposals++; y.proceeds += d.proceeds; y.costs += d.cost; if (d.gain >= 0) y.gains += d.gain; else y.losses -= d.gain; y.net += d.gain;
  }
  for (const y of Object.values(years)) { for (const k of ['proceeds', 'costs', 'gains', 'losses', 'net']) y[k] = r2(y[k]); y.taxableAfterAEA = y.annualExemptAmount == null ? null : r2(Math.max(0, y.net - y.annualExemptAmount)); }
  return {
    method: 'uk-cgt (same-day, 30-day, s104)',
    disposals: disposals.map((d) => ({ ...d, proceeds: r2(d.proceeds), cost: r2(d.cost), gain: r2(d.gain), matches: d.matches.map((m) => ({ ...m, cost: r2(m.cost) })) })),
    taxYears: Object.values(years).sort((a, b) => a.taxYear.localeCompare(b.taxYear)),
    pools: Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, { qty: v.qty, cost: r2(v.cost), avgCost: v.avgCost }])),
    warnings,
    disclaimer: 'Arithmetic aid only, not tax advice. Values must be in GBP at the time of each trade (HMRC).',
  };
}

/** FIFO realised PnL (common trader view). */
export function fifoPnl(trades) {
  const T = trades.map(normaliseTrade).sort((a, b) => a.ts - b.ts || a.i - b.i);
  const lots = {}; const out = []; const warnings = [];
  for (const t of T) {
    const L = (lots[t.asset] ||= []);
    if (t.side === 'buy') { L.push({ qty: t.qty, unit: (t.total + t.fee) / t.qty, day: t.day }); continue; }
    let q = t.qty; let cost = 0;
    while (q > 1e-12 && L.length) { const l = L[0]; const m = Math.min(q, l.qty); cost += m * l.unit; l.qty -= m; q -= m; if (l.qty <= 1e-12) L.shift(); }
    if (q > 1e-9) warnings.push(`${t.asset} ${t.day}: sold ${q} more than held`);
    const proceeds = t.total - t.fee;
    out.push({ asset: t.asset, day: t.day, qty: t.qty, proceeds: r2(proceeds), cost: r2(cost), pnl: r2(proceeds - cost) });
  }
  const open = Object.fromEntries(Object.entries(lots).map(([a, L]) => [a, { qty: L.reduce((s, l) => s + l.qty, 0), cost: r2(L.reduce((s, l) => s + l.qty * l.unit, 0)) }]));
  return { method: 'fifo', realised: out, totalRealised: r2(out.reduce((s, x) => s + x.pnl, 0)), open, warnings };
}

/** Unrealised PnL for open positions given { asset: priceInReportingCurrency }. */
export function unrealised(pools, prices) {
  return Object.entries(pools).filter(([, p]) => p.qty > 1e-12).map(([asset, p]) => {
    const px = prices[asset];
    return { asset, qty: p.qty, cost: p.cost, price: px ?? null, value: px == null ? null : r2(p.qty * px), pnl: px == null ? null : r2(p.qty * px - p.cost) };
  });
}

/** Parse CSV with header time,side,asset,qty,total[,fee][,quoteAsset][,quoteQty][,note]. */
export function parseTradesCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const head = lines.shift().split(',').map((h) => h.trim());
  for (const req of ['time', 'side', 'asset', 'qty', 'total']) if (!head.includes(req)) throw new Error(`CSV header missing "${req}"`);
  return lines.map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, (c[i] ?? '').trim()])); });
}

const rotkiAsset = (a) => (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) ? `solana/token:${a}` : /^0x[0-9a-fA-F]{40}$/.test(a) ? `eip155:1/erc20:${a}` : a);
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** rotki "Rotki generic trades" CSV (Location, Spend/Receive Currency+Amount, Fee, Fee Currency, Description, Timestamp ms). */
export function toRotkiCsv(trades, { currency = 'GBP', location = 'external' } = {}) {
  const head = ['Location', 'Spend Currency', 'Spend Amount', 'Receive Currency', 'Receive Amount', 'Fee', 'Fee Currency', 'Description', 'Timestamp'];
  const rows = trades.map(normaliseTrade).map((t) => {
    const quote = t.quoteAsset ? rotkiAsset(t.quoteAsset) : currency;
    const quoteAmt = t.quoteQty ?? t.total;
    const tok = rotkiAsset(t.asset);
    const [sc, sa, rc, ra] = t.side === 'buy' ? [quote, quoteAmt, tok, t.qty] : [tok, t.qty, quote, quoteAmt];
    return [location, sc, sa, rc, ra, t.fee || '', t.fee ? currency : '', t.note || `memecoin-markets ${t.side}`, t.ts].map(csvCell).join(',');
  });
  return [head.join(','), ...rows].join('\n') + '\n';
}
