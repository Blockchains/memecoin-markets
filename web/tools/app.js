import { scanToken, radar, POLICY, ukCgt, fifoPnl, parseTradesCsv, toRotkiCsv, evaluateChecklist, valuePortfolio, walletHoldings, isSolanaAddress } from '../lib/index.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: n < 1 ? 8 : 0 }));
const gbp = (n) => (n == null ? '—' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : null);
const params = new URLSearchParams(location.search);
if (params.get('embed') === '1') document.body.classList.add('embed');
$('#policy-id').textContent = POLICY.id;

// ---------- tabs / routing ----------
function route() {
  const [tab, q] = (location.hash.slice(1) || 'scan').split('?');
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const p = new URLSearchParams(q || '');
  if (tab === 'scan' && p.get('address')) { $('#scan-addr').value = p.get('address'); $('#scan-chain').value = p.get('chain') || ''; runScan(); }
  if (tab === 'checklist' && p.get('address')) { $('#cl-addr').value = p.get('address'); runChecklist(); }
  if (tab === 'radar' && !radarLoaded) loadRadarSnapshot();
  if (tab === 'portfolio') renderPortfolio();
  if (tab === 'api') renderApi();
}
addEventListener('hashchange', route);
const net = () => { $('#net').textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE'; $('#net').classList.toggle('off', !navigator.onLine); };
addEventListener('online', net); addEventListener('offline', net); net();

// ---------- scanner ----------
const explorer = (s) => s.chain === 'solana' ? `https://solscan.io/token/${s.address}` : { ethereum: 'https://etherscan.io', base: 'https://basescan.org', bsc: 'https://bscscan.com', arbitrum: 'https://arbiscan.io', polygon: 'https://polygonscan.com' }[s.chain] + `/token/${s.address}`;
function renderScan(s) {
  const m = s.market || {};
  const links = [
    m.url && `<a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">DexScreener</a>`,
    `<a href="${esc(explorer(s))}" target="_blank" rel="noopener">Explorer</a>`,
    s.chain === 'solana' && `<a href="https://rugcheck.xyz/tokens/${esc(s.address)}" target="_blank" rel="noopener">RugCheck</a>`,
    s.chain !== 'solana' && `<a href="https://honeypot.is/?address=${esc(s.address)}" target="_blank" rel="noopener">honeypot.is</a>`,
    s.chain !== 'solana' && `<a href="https://blockchains.github.io/approvals/" target="_blank" rel="noopener">Check approvals (Blockchain Lab)</a>`,
    `<a href="#checklist?address=${esc(s.address)}">Launch checklist</a>`,
    `<a href="../token/${esc(s.chain)}/${esc(s.chain === 'solana' ? s.address : s.address.toLowerCase())}/">Token page</a>`,
  ].filter(Boolean).join(' · ');
  const errs = Object.entries(s.errors || {});
  return `<div class="card"><div class="verdict v-${esc(s.verdict)}" data-verdict="${esc(s.verdict)}">${esc(s.verdict)}</div>
  <p>${esc(s.verdictNote)}</p>
  <dl class="grid kv"><div><dt>Token</dt><dd>${esc(s.token?.symbol || '?')}${s.token?.name && s.token.name !== s.token.symbol ? ' · ' + esc(s.token.name) : ''}</dd></div><div><dt>Chain</dt><dd>${esc(s.chain)}</dd></div><div><dt>Price</dt><dd>${usd(m.priceUsd)}</dd></div><div><dt>Liquidity</dt><dd>${usd(m.liquidityUsd)}</dd></div><div><dt>FDV</dt><dd>${usd(m.fdvUsd)}</dd></div><div><dt>Pool</dt><dd>${esc(m.dex || '—')}${m.createdAt ? ' · ' + esc(new Date(m.createdAt).toISOString().slice(0, 10)) : ''}</dd></div><div><dt>Holders</dt><dd>${esc(s.token?.holders ?? '—')}</dd></div><div><dt>Scan</dt><dd>${esc(s.ms)} ms</dd></div></dl>
  <p class="addr">${esc(s.address)}</p><p class="small">${links}</p></div>
  <table id="checks"><thead><tr><th>Status</th><th>Check</th><th>Value</th><th>Source</th></tr></thead><tbody>
  ${s.checks.map((c) => `<tr data-check="${esc(c.id)}"><td><span class="s s-${esc(c.status)}">${esc(c.status.toUpperCase())}</span>${c.hard ? '' : ' <span class="muted small">soft</span>'}</td><td>${esc(c.label)}${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}</td><td class="addr">${esc(c.value ?? '—')}</td><td class="muted small">${esc(c.source)}</td></tr>`).join('')}
  </tbody></table>${errs.length ? `<p class="err small">Unavailable: ${errs.map(([k, v]) => esc(k + ' — ' + v)).join('; ')}</p>` : ''}`;
}
async function runScan() {
  const out = $('#scan-out'); const address = $('#scan-addr').value.trim(); const chain = $('#scan-chain').value || undefined;
  out.innerHTML = '<p class="muted">Scanning…</p>';
  try { const s = await scanToken({ address, chain }); out.innerHTML = renderScan(s); localStorage.setItem('mm:lastScan', JSON.stringify(s)); }
  catch (e) {
    const last = JSON.parse(localStorage.getItem('mm:lastScan') || 'null');
    out.innerHTML = `<p class="err">${esc(e.message)}</p>` + (last && last.address === address ? `<p class="muted">Showing your last saved scan from ${esc(last.scannedAt)}:</p>` + renderScan(last) : '');
  }
}
$('#scan-form').addEventListener('submit', (e) => { e.preventDefault(); const a = $('#scan-addr').value.trim(); const c = $('#scan-chain').value; const h = `#scan?address=${encodeURIComponent(a)}${c ? '&chain=' + c : ''}`; if (location.hash === h) runScan(); else location.hash = h; });

// ---------- radar ----------
let radarLoaded = false;
function renderRadar(r, label) {
  $('#radar-meta').textContent = `${label} · ${r.count} rows · ${new Date(r.generatedAt).toLocaleString('en-GB')}` + (Object.keys(r.errors || {}).length ? ` · degraded: ${Object.keys(r.errors).join(', ')}` : '');
  $('#radar-out').innerHTML = `<table id="radar-table"><thead><tr><th>Token</th><th>Age</th><th>Liquidity</th><th>FDV</th><th>5m buys/sells</th><th>Flags</th><th>Via</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td><a href="#scan?address=${esc(x.address)}&chain=${esc(r.chain)}">${esc(x.symbol || '?')}</a><div class="addr muted">${esc(x.address)}</div></td><td class="num">${x.ageMin == null ? '—' : x.ageMin < 120 ? esc(x.ageMin) + 'm' : Math.round(x.ageMin / 60) + 'h'}</td><td class="num">${usd(x.liquidityUsd)}</td><td class="num">${usd(x.fdvUsd)}</td><td class="num">${esc(x.txns5m?.buys ?? '—')}/${esc(x.txns5m?.sells ?? '—')}</td><td>${(x.flags || []).map((f) => `<div class="flag">${esc(f)}</div>`).join('')}${x.rugcheck ? `<div class="muted small">rugcheck ${esc(x.rugcheck.score)}/100</div>` : ''}</td><td class="muted small">${esc((x.via || []).join(' '))}</td></tr>`).join('')}</tbody></table>`;
}
async function loadRadarSnapshot() {
  radarLoaded = true;
  const chain = $('#radar-chain').value;
  try { const r = await (await fetch(`../v1/radar-${chain}.json`)).json(); renderRadar(r, 'Snapshot (Actions)'); }
  catch { $('#radar-out').innerHTML = '<p class="muted">No snapshot for this chain yet — press Live refresh.</p>'; }
}
$('#radar-chain').addEventListener('change', loadRadarSnapshot);
$('#radar-live').addEventListener('click', async () => {
  const b = $('#radar-live'); b.disabled = true; b.textContent = 'Fetching…';
  try { renderRadar(await radar({ chain: $('#radar-chain').value, limit: 50, rugcheck: 5 }), 'Live (your browser)'); }
  catch (e) { $('#radar-meta').textContent = 'Live fetch failed: ' + e.message; }
  finally { b.disabled = false; b.textContent = 'Live refresh'; }
});

// ---------- PnL ----------
const SAMPLE = `time,side,asset,qty,total,fee,quoteAsset,quoteQty,note
2024-05-01,buy,WIF,1000,1000,0,SOL,7.1,first buy
2024-06-01,buy,WIF,1000,2990,10,SOL,23.4,
2024-07-01,sell,WIF,500,2510,10,SOL,21.0,30-day rule applies
2024-07-15,buy,WIF,300,600,0,SOL,5.2,re-buy within 30 days
2024-08-01,buy,WIF,100,50,0,SOL,0.4,same day
2024-08-01,sell,WIF,100,80,0,SOL,0.6,same day
2025-04-05,sell,WIF,800,4000,0,SOL,31.0,last day of 2024/25
2025-04-06,sell,WIF,1000,500,0,SOL,3.9,first day of 2025/26`;
$('#pnl-csv').value = localStorage.getItem('mm:trades') || '';
$('#pnl-sample').addEventListener('click', () => { $('#pnl-csv').value = SAMPLE; runPnl(); });
$('#pnl-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { $('#pnl-csv').value = await f.text(); runPnl(); } });
$('#pnl-run').addEventListener('click', runPnl);
$('#pnl-rotki').addEventListener('click', () => {
  try { const csv = toRotkiCsv(parseTradesCsv($('#pnl-csv').value)); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'rotki-generic-trades.csv' }); a.click(); }
  catch (e) { $('#pnl-out').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
});
function runPnl() {
  const out = $('#pnl-out');
  try {
    const trades = parseTradesCsv($('#pnl-csv').value);
    localStorage.setItem('mm:trades', $('#pnl-csv').value);
    const uk = ukCgt(trades); const ff = fifoPnl(trades);
    out.innerHTML = `<h2>UK tax years</h2><table id="cgt-years"><thead><tr><th>Tax year</th><th>Disposals</th><th>Proceeds</th><th>Costs</th><th>Gains</th><th>Losses</th><th>Net</th><th>Annual exempt</th><th>Above exempt</th></tr></thead><tbody>${uk.taxYears.map((y) => `<tr data-year="${esc(y.taxYear)}"><td>${esc(y.taxYear)}</td><td class="num">${y.disposals}</td><td class="num">${gbp(y.proceeds)}</td><td class="num">${gbp(y.costs)}</td><td class="num">${gbp(y.gains)}</td><td class="num">${gbp(y.losses)}</td><td class="num net">${gbp(y.net)}</td><td class="num">${gbp(y.annualExemptAmount)}</td><td class="num">${gbp(y.taxableAfterAEA)}</td></tr>`).join('')}</tbody></table>
    <h2>Disposals (HMRC matching)</h2><table><thead><tr><th>Date</th><th>Asset</th><th>Qty</th><th>Proceeds</th><th>Cost</th><th>Gain</th><th>Matched by</th></tr></thead><tbody>${uk.disposals.map((d) => `<tr><td>${esc(d.day)}</td><td>${esc(d.asset)}</td><td class="num">${esc(d.qty)}</td><td class="num">${gbp(d.proceeds)}</td><td class="num">${gbp(d.cost)}</td><td class="num">${gbp(d.gain)}</td><td class="small">${d.matches.map((m) => `${esc(m.rule)} ${esc(+m.qty.toFixed(6))} @ ${gbp(m.cost)}`).join('<br>')}</td></tr>`).join('')}</tbody></table>
    <h2>Section 104 pools (open)</h2><table><thead><tr><th>Asset</th><th>Qty</th><th>Pool cost</th></tr></thead><tbody>${Object.entries(uk.pools).map(([a, p]) => `<tr><td>${esc(a)}</td><td class="num">${esc(+p.qty.toFixed(6))}</td><td class="num">${gbp(p.cost)}</td></tr>`).join('')}</tbody></table>
    <h2>FIFO realised PnL (trader view)</h2><p>Total realised: <b>${gbp(ff.totalRealised)}</b></p>
    ${[...uk.warnings, ...ff.warnings].map((w) => `<p class="flag">${esc(w)}</p>`).join('')}<p class="muted small">${esc(uk.disclaimer)}</p>`;
  } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------- checklist ----------
const manual = () => JSON.parse(localStorage.getItem('mm:manual') || '{}');
async function runChecklist() {
  const out = $('#cl-out'); const address = $('#cl-addr').value.trim(); out.innerHTML = '<p class="muted">Scanning…</p>';
  try {
    const s = await scanToken({ address }); const items = evaluateChecklist(s); const m = manual();
    out.innerHTML = `<p>Verdict <span class="verdict v-${esc(s.verdict)}" style="font-size:16px">${esc(s.verdict)}</span> · ${esc(s.token?.symbol || '')}</p><table id="cl-table"><thead><tr><th>State</th><th>Item</th><th>Evidence</th></tr></thead><tbody>${items.map((i) => `<tr data-item="${esc(i.id)}"><td>${i.state === 'manual' ? `<input type="checkbox" data-manual="${esc(i.id)}" ${m[address + ':' + i.id] ? 'checked' : ''} style="min-height:auto;flex:none">` : `<span class="s s-${esc(i.state)}">${esc(i.state.toUpperCase())}</span>`}</td><td>${esc(i.text)}</td><td class="addr muted">${esc(i.evidence || '')}</td></tr>`).join('')}</tbody></table>`;
    out.querySelectorAll('[data-manual]').forEach((cb) => cb.addEventListener('change', () => { const mm = manual(); mm[address + ':' + cb.dataset.manual] = cb.checked; localStorage.setItem('mm:manual', JSON.stringify(mm)); }));
  } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
$('#cl-form').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#checklist?address=${encodeURIComponent($('#cl-addr').value.trim())}`; });

// ---------- portfolio ----------
const holdings = () => JSON.parse(localStorage.getItem('mm:holdings') || '[]');
const saveH = (h) => localStorage.setItem('mm:holdings', JSON.stringify(h));
async function renderPortfolio(refresh = false) {
  const h = holdings(); const out = $('#pf-out');
  if (!h.length) { out.innerHTML = '<p class="muted">No holdings yet.</p>'; return; }
  let v = JSON.parse(localStorage.getItem('mm:pfvalue') || 'null');
  if (refresh || !v || v.rows.length !== h.length) { try { v = await valuePortfolio(h, { gbp: true }); localStorage.setItem('mm:pfvalue', JSON.stringify(v)); } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; if (!v) return; } }
  out.innerHTML = `<p>Total <b>${usd(v.totalUsd)}</b> · <b>${gbp(v.totalGbp)}</b> <span class="muted small">priced ${esc(new Date(v.pricedAt).toLocaleString('en-GB'))}${v.gbpUsd ? ` · GBP/USD ${esc(v.gbpUsd.rate)}` : ''}</span></p><table id="pf-table"><thead><tr><th>Mint</th><th>Qty</th><th>Price</th><th>Value</th><th>24h</th><th></th></tr></thead><tbody>${v.rows.map((r, i) => `<tr><td class="addr"><a href="#scan?address=${esc(r.mint)}">${esc(r.mint)}</a></td><td class="num">${esc(r.qty)}</td><td class="num">${usd(r.usdPrice)}</td><td class="num">${usd(r.valueUsd)}<div class="muted">${gbp(r.valueGbp)}</div></td><td class="num">${r.change24hPct == null ? '—' : esc(r.change24hPct.toFixed(1)) + '%'}</td><td><button class="ghost" data-del="${i}">×</button></td></tr>`).join('')}</tbody></table>`;
  out.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const hh = holdings(); hh.splice(+b.dataset.del, 1); saveH(hh); renderPortfolio(true); }));
}
$('#pf-form').addEventListener('submit', (e) => { e.preventDefault(); const mint = $('#pf-mint').value.trim(); if (!isSolanaAddress(mint)) return alert('Not a Solana mint'); saveH([...holdings(), { mint, qty: Number($('#pf-qty').value) }]); e.target.reset(); renderPortfolio(true); });
$('#pf-wallet').addEventListener('submit', async (e) => { e.preventDefault(); const owner = $('#pf-owner').value.trim(); const rpc = $('#pf-rpc').value.trim(); if (!owner || !rpc) return alert('Wallet and your own RPC URL are both needed (free public RPCs block this call from browsers).'); try { const w = await walletHoldings(owner, { rpc }); saveH([...holdings(), ...w.slice(0, 50)]); renderPortfolio(true); } catch (err) { $('#pf-out').innerHTML = `<p class="err">${esc(err.message)}</p>`; } });
$('#pf-refresh').addEventListener('click', () => renderPortfolio(true));

// ---------- API tab ----------
async function renderApi() {
  try { const idx = await (await fetch('../v1/index.json')).json(); $('#api-list').innerHTML = idx.endpoints.map((e) => `<li><a href="${esc(e.url)}">${esc(e.path)}</a> — ${esc(e.description)}</li>`).join(''); } catch { /* offline first visit */ }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register('../sw.js', { scope: '../' });
route();
