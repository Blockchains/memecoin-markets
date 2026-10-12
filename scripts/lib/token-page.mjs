// Per-token page: /token/{chain}/{address}/ (or /coin/{coingecko-id}/ for native coins without a contract).
import { layout, table, logo, tokenLabel, crumbsLd, esc, price, usd, usdFull, pct, num, date, dateLong, age, spark, chainName, EXPLORER, short } from './render.mjs';
import { MEME_CATEGORIES } from '../../src/sources/coingecko.js';
const CAT = Object.fromEntries(MEME_CATEGORIES);

export const indexable = (t) => !t.suspicious && (!!t.cg || ((t.liq || 0) >= 10000 && (t.vol24 || 0) >= 5000));

function summary(t, ctx) {
  const L = tokenLabel(t); const out = [];
  const cats = (t.cats || []).filter((x) => CAT[x]).map((x) => CAT[x]);
  out.push(`${esc(L)} is ${t.chain ? `a ${esc(chainName(t.chain))}` : 'a'} memecoin${cats.length ? ` listed in ${cats.slice(0, 3).map(esc).join(', ')}` : ''}.`);
  if (t.rank) out.push(`It ranks <b>#${t.rank}</b> by market cap among the ${num(ctx.ranked)} memecoins ranked on this site${t.cgRank ? ` (#${t.cgRank} across all crypto on CoinGecko)` : ''}.`);
  if (t.mcap || t.vol24) out.push(`Market cap is ${usd(t.mcap)} with ${usd(t.vol24)} traded in the last 24 hours${t.ch24h != null ? `; the price moved ${t.ch24h >= 0 ? 'up' : 'down'} ${Math.abs(t.ch24h).toFixed(1)}% over that period` : ''}.`);
  if (t.pools?.length) { const p = t.pools[0]; out.push(`The deepest pool is ${esc(t.symbol)}/${esc(p.quote)} on ${esc(p.dex)} with ${usd(p.liq)} of liquidity; across ${num(t.pairsCount)} DEX pool${t.pairsCount === 1 ? '' : 's'} on-chain liquidity totals ${usd(t.liq)}.`); }
  if (t.ath && t.priceUsd) { const d = (t.priceUsd / t.ath - 1) * 100; out.push(`It trades ${Math.abs(d).toFixed(0)}% ${d < 0 ? 'below' : 'above'} its all-time high of ${price(t.ath)} (${dateLong(t.athDate)}).`); }
  if (t.createdAt) out.push(`Its first DEX pool was created ${dateLong(t.createdAt)} (${age(t.createdAt)} ago).`);
  if (t.gt?.holders?.count) out.push(`About ${num(t.gt.holders.count)} wallets hold it; the top 10 hold ${t.gt.holders.dist?.top_10 != null ? t.gt.holders.dist.top_10.toFixed(1) + '%' : 'an unknown share'}.`);
  return out.join(' ');
}

function safety(t, scan) {
  if (!scan) return `<p class="muted">No stored scan yet. The live scan below runs in your browser against free public sources.</p>`;
  const rows = scan.checks.map((c) => `<tr data-check="${esc(c.id)}"><td><span class="s s-${esc(c.status)}">${esc(c.status.toUpperCase())}</span>${c.hard ? '' : ' <span class="muted small">soft</span>'}</td><td>${esc(c.label)}${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}</td><td class="mono small">${esc(c.value ?? '—')}</td><td class="muted small">${esc(c.source)}</td></tr>`).join('');
  return `<p><span class="v v-${esc(scan.verdict)}" data-verdict="${esc(scan.verdict)}">${esc(scan.verdict)}</span> <span class="muted small">stored scan · ${esc(dateLong(scan.scannedAt))} · ${esc(scan.policy)}</span></p><p class="small">${esc(scan.verdictNote || '')}</p>
<div class="tw"><table class="checks"><thead><tr><th>Status</th><th>Check</th><th>Value</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function tokenPage(c, t, { scan, related, ctx }) {
  const L = tokenLabel(t);
  const sym = t.symbol || short(t.address);
  const cn = chainName(t.chain);
  const crumbs = [['', 'Memecoins'], ...(t.chain ? [[`chain/${t.chain}/`, `${cn} memecoins`]] : []), [t.path, `${t.name || sym}`]];
  const title = `${t.name || sym} (${sym}) Price, Chart & Safety Scan · ${cn} memecoin`;
  const description = `${L}${t.chain ? ` on ${cn}` : ''}: price ${price(t.priceUsd)}, market cap ${usd(t.mcap)}, 24h volume ${usd(t.vol24)}${t.liq ? `, ${usd(t.liq)} DEX liquidity` : ''}. Live chart, holders, LP pools and a free rug/honeypot check. Not advice.`;
  const R = '../'.repeat(t.path.split('/').filter(Boolean).length);
  const exp = t.address && EXPLORER[t.chain] ? EXPLORER[t.chain] + t.address : null;
  const links = (t.links || []).map((l) => `<a href="${esc(l.url)}" rel="nofollow noopener ugc" target="_blank">${esc(l.type === 'twitter' ? 'X / Twitter' : l.type[0].toUpperCase() + l.type.slice(1))}</a>`).join(' · ');
  const flagged = t.linkCheck?.flagged?.length ? `<p class="err">⚠ ${t.linkCheck.flagged.map(esc).join(', ')} is on the phishing deny-list (Blockchains/phishing). Do not connect a wallet there.</p>` : '';
  const pools = t.pools?.length ? `<div class="tw"><table class="rt"><thead><tr><th>DEX</th><th>Pair</th><th class="num">Liquidity</th><th class="num">Volume 24h</th><th class="num">Price</th><th class="num">Created</th></tr></thead><tbody>${t.pools.map((p) => `<tr><td>${esc(p.dex)}${p.labels?.length ? ` <span class="muted small">${esc(p.labels.join(' '))}</span>` : ''}</td><td><a href="${esc(p.url)}" rel="nofollow noopener" target="_blank">${esc(sym)}/${esc(p.quote)}</a></td><td class="num">${usd(p.liq)}</td><td class="num">${usd(p.vol24)}</td><td class="num">${price(p.priceUsd)}</td><td class="num">${date(p.createdAt)}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Pools from DexScreener${t.poolsAt ? `, ${esc(dateLong(t.poolsAt))}` : ''}. LP lock/burn status is in the safety scan.</p>` : `<p class="muted">No DEX pools found${t.address ? '' : ' — this coin has its own chain'}.</p>`;
  const h = t.gt?.holders;
  const dist = h?.dist ? Object.entries(h.dist).map(([k, v]) => `<div class="bar"><span>${esc(k.replace('_', '–').replace('top–10', 'Top 10').replace('rest', 'Rest'))}</span><i style="width:${Math.min(100, v || 0).toFixed(1)}%"></i><b>${v == null ? '—' : v.toFixed(1) + '%'}</b></div>`).join('') : '';
  const relRows = related.length ? table(related, R, { cols: ['rank', 'name', 'price', 'ch24h', 'mcap', 'liq'], id: 'related', start: 1 }) : '';
  const cats = (t.cats || []).filter((x) => CAT[x]);
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': c.site + t.path, url: c.site + t.path, name: title, description, dateModified: c.built, isPartOf: { '@id': c.site + '#website' }, breadcrumb: { '@id': c.site + t.path + '#breadcrumb' }, about: { '@id': c.site + t.path + '#token' } },
    { ...crumbsLd(c, crumbs), '@id': c.site + t.path + '#breadcrumb' },
    { '@type': 'FinancialProduct', '@id': c.site + t.path + '#token', name: L, alternateName: t.symbol || undefined, category: 'Cryptocurrency › Memecoin', description: `${L} memecoin${t.chain ? ` on ${cn}` : ''}.`, url: c.site + t.path, image: t.image || undefined, identifier: t.address || t.cg, ...(t.links?.length ? { sameAs: t.links.filter((l) => ['website', 'twitter'].includes(l.type)).map((l) => l.url).slice(0, 4) } : {}), ...(t.priceUsd != null ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'Price (USD)', value: t.priceUsd }, ...(t.mcap ? [{ '@type': 'PropertyValue', name: 'Market cap (USD)', value: Math.round(t.mcap) }] : [])] } : {}) },
  ] };
  const body = `<article class="token" data-id="${esc(t.id)}" ${t.address ? `data-chain="${esc(t.chain)}" data-addr="${esc(t.address)}"` : ''} data-pool="${esc(t.pools?.[0]?.pair || '')}" data-sym="${esc(sym)}">
<header class="th">
  ${logo(t, R, 48, true)}
  <div><h1>${esc(t.name || sym)} <span class="sym">${esc(sym)}</span></h1>
  <p class="muted small">${t.rank ? `Rank #${t.rank} · ` : ''}${esc(cn)}${t.address ? ` · <span class="mono" title="${esc(t.address)}">${esc(short(t.address))}</span> <button class="copy ghost" data-copy="${esc(t.address)}">Copy</button>` : ''}${t.stale ? ' · <span class="warn">not seen in the latest refresh</span>' : ''}</p></div>
  <div class="tp"><div class="px" data-live="price">${price(t.priceUsd)}</div><div>${pct(t.ch24h)} <span class="muted small">24h</span></div></div>
  <div class="ta"><button class="star big" data-star="${esc(t.id)}" aria-label="Add to watchlist">☆ Watch</button> <a class="btn ghost" href="${R}compare/?ids=${encodeURIComponent(t.id)}">Compare</a></div>
</header>
<dl class="stats">
  <div><dt>Market cap</dt><dd data-live="mcap">${usd(t.mcap)}</dd></div>
  <div><dt>FDV</dt><dd data-live="fdv">${usd(t.fdv)}</dd></div>
  <div><dt>Volume 24h</dt><dd data-live="vol24">${usd(t.vol24)}</dd></div>
  <div><dt>DEX liquidity</dt><dd data-live="liq">${usd(t.liq)}</dd></div>
  <div><dt>1h / 7d</dt><dd>${pct(t.ch1h)} ${pct(t.ch7d)}</dd></div>
  <div><dt>Holders</dt><dd data-live="holders">${h?.count ? num(h.count) : '—'}</dd></div>
  <div><dt>Circulating</dt><dd>${t.circ ? num(t.circ) : '—'}</dd></div>
  <div><dt>All-time high</dt><dd>${price(t.ath)}<span class="muted small"> ${t.athDate ? date(t.athDate) : ''}</span></dd></div>
</dl>
<section class="card chart-card"><h2>${esc(sym)} price chart</h2>
  <div class="chart" id="chart" data-tf="hour">${spark(t.spark, { w: 640, h: 180, cls: 'big' }) || '<p class="muted">Chart loads from GeckoTerminal.</p>'}</div>
  <div class="row small"><button class="ghost" data-tf="minute" data-agg="15">15m</button><button class="ghost" data-tf="hour" data-agg="1">1h</button><button class="ghost" data-tf="hour" data-agg="4">4h</button><button class="ghost" data-tf="day" data-agg="1">1d</button><span class="muted">7-day sparkline from CoinGecko; interactive OHLCV from GeckoTerminal.</span></div>
</section>
<section><h2>About ${esc(t.name || sym)}</h2><p>${summary(t, ctx)}</p>
${links ? `<p class="small">Links: ${links}</p>` : ''}${flagged}
<p class="small">${exp ? `<a href="${esc(exp)}" rel="nofollow noopener" target="_blank">Explorer</a> · ` : ''}${t.cg ? `<a href="https://www.coingecko.com/en/coins/${esc(t.cg)}" rel="nofollow noopener" target="_blank">CoinGecko</a> · ` : ''}${t.address ? `<a href="https://dexscreener.com/${esc(t.chain)}/${esc(t.address)}" rel="nofollow noopener" target="_blank">DexScreener</a> · ` : ''}${t.chain === 'solana' ? `<a href="https://rugcheck.xyz/tokens/${esc(t.address)}" rel="nofollow noopener" target="_blank">RugCheck</a> · ` : ''}${cats.map((x) => `<a href="${R}category/${x}/">${esc(CAT[x])}</a>`).join(' · ')}</p></section>
<section class="card" id="safety"><h2>Is ${esc(sym)} safe? Rug &amp; honeypot checks</h2>
${t.address ? safety(t, scan) + `<p><button id="live-scan" data-chain="${esc(t.chain)}" data-addr="${esc(t.address)}">Run live scan now</button> <span class="muted small">Runs in your browser: Solana RPC, RugCheck, GoPlus, honeypot.is, on-chain eth_call simulation, Jupiter. Nothing is signed.</span></p><div id="live-scan-out" aria-live="polite"></div>` : '<p class="muted">Native coin of its own chain — contract-level checks (mint authority, honeypot, tax) do not apply.</p>'}
</section>
<section class="card" id="holders"><h2>${esc(sym)} holders</h2>
${h ? `<p>${num(h.count)} holders <span class="muted small">(GeckoTerminal, ${esc(date(h.updated))})</span></p><div class="dist">${dist}</div>` : '<p class="muted">Holder data loads live from GeckoTerminal when available.</p>'}
${t.gt?.mintAuthority ? `<p class="small">Mint authority: <b>${esc(t.gt.mintAuthority)}</b> · Freeze authority: <b>${esc(t.gt.freezeAuthority)}</b>${t.gt.devPct != null ? ` · Dev holds ${esc(t.gt.devPct)}%` : ''} <span class="muted">(GeckoTerminal)</span></p>` : ''}
<div id="holders-live"></div></section>
<section id="pools"><h2>Where ${esc(sym)} trades — liquidity pools</h2>${pools}</section>
<section><h2>${esc(sym)} and UK tax</h2><p>In the UK each memecoin is a separate asset with its own Section 104 pool. Selling ${esc(sym)} for SOL, ETH, a stablecoin or pounds is a disposal for Capital Gains Tax, and the same-day and 30-day rules apply before pooling. Read the <a href="${R}guides/uk-memecoin-tax/">UK memecoin tax guide</a> or calculate gains in the free <a href="${R}tools/#pnl">PnL / UK CGT tool</a>.</p></section>
${relRows ? `<section><h2>Related memecoins</h2>${relRows}</section>` : ''}
<p class="muted small">Data: ${(t.sources || []).map(esc).join(', ')}${t.gt ? ', geckoterminal' : ''}. Page rebuilt ${esc(dateLong(c.built))}. Prices refresh live in your browser.</p>
</article>`;
  return layout(c, { path: t.path, title, description, body, jsonld, crumbs, image: t.image, noindex: !indexable(t), bodyClass: 'pg-token' });
}
