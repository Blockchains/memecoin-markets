// Static HTML renderer for the rankings product. Every page is complete HTML (fast LCP, crawlable),
// with relative links so the same build works at blockchains.github.io/memecoin-markets/ and at a domain root.
import { esc, price, usd, usdFull, pct, num, date, dateLong, age, spark, chainName, EXPLORER, short } from './format.mjs';

export const SITE_NAME = 'Memecoin Markets';
export function ctx({ site, built }) { return { site, built }; }

const NAV = [['', 'Rankings'], ['trending/', 'Trending'], ['new/', 'New pairs'], ['gainers/', 'Gainers'], ['losers/', 'Losers'], ['categories/', 'Categories'], ['chains/', 'Chains'], ['watchlist/', 'Watchlist'], ['compare/', 'Compare'], ['guides/', 'Guides'], ['tools/', 'Tools']];

export function layout(c, p) {
  const depth = p.path.split('/').filter(Boolean).length;
  const R = '../'.repeat(depth);
  const url = c.site + p.path;
  const title = p.title.length > 70 ? p.title.slice(0, 69) + '…' : p.title;
  const robots = p.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  const og = p.image && /^https:\/\//.test(p.image) ? p.image : c.site + 'og.png';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${p.ogType || 'website'}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="${p.image ? 'summary' : 'summary_large_image'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(og)}">
${c.gsc ? `<meta name="google-site-verification" content="${esc(c.gsc)}">\n` : ''}<meta name="theme-color" content="#05070d">
<meta name="mm-root" content="${R || './'}">
<link rel="manifest" href="${R}manifest.webmanifest">
<link rel="icon" href="${R}favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/json" href="${R}v1/index.json" title="Memecoin Markets JSON API">
<link rel="stylesheet" href="${R}site.css">
${p.head || ''}${p.jsonld ? `<script type="application/ld+json">${JSON.stringify(p.jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body${p.bodyClass ? ` class="${p.bodyClass}"` : ''}>
<a class="skip" href="#main">Skip to content</a>
<header class="hd">
  <a class="brand" href="${R || './'}"><span class="logo">M</span><span>memecoin<b>.markets</b></span></a>
  <form class="search" action="${R}search/" role="search"><input name="q" type="search" placeholder="Search name, symbol or address" aria-label="Search memecoins" autocomplete="off" spellcheck="false"><div class="sugg" hidden></div></form>
  <span id="net" class="pill" title="Connection">ONLINE</span>
  <nav aria-label="Main">${NAV.map(([h, l]) => `<a href="${R}${h}"${p.nav === h ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
</header>
${p.crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${p.crumbs.map(([h, l], i) => (i < p.crumbs.length - 1 ? `<a href="${R}${h}">${esc(l)}</a> › ` : `<span>${esc(l)}</span>`)).join('')}</nav>` : ''}
<main id="main" data-pagefind-body>
${p.body}
</main>
<footer class="ft">
  <p><b>Not financial or tax advice.</b> Memecoins are extremely volatile; most go to zero. Safety checks are evidence from named public sources and can be wrong or bypassed — a pass is not a buy.</p>
  <p>Data: <a href="https://www.coingecko.com/" rel="nofollow noopener">CoinGecko</a> (public API) · <a href="https://dexscreener.com/" rel="nofollow noopener">DexScreener</a> · <a href="https://www.geckoterminal.com/" rel="nofollow noopener">GeckoTerminal</a> · RugCheck · GoPlus · honeypot.is · Jupiter · public RPCs. Charts by <a href="https://www.tradingview.com/" rel="nofollow noopener">TradingView Lightweight Charts™</a>. Updated ${esc(dateLong(c.built))} ${esc(new Date(c.built).toISOString().slice(11, 16))} UTC.</p>
  <p><a href="${R}methodology/">Methodology</a> · <a href="${R}about/">About</a> · <a href="${R}guides/">Guides</a> · <a href="${R}tools/#api">API</a> · <a href="${R}llms.txt">llms.txt</a> · <a href="https://github.com/Blockchains/memecoin-markets">Source (MIT)</a> · Built by <a href="https://blockchainlab.com">Blockchain Lab</a></p>
</footer>
<script type="module" src="${R}site.js"></script>
</body>
</html>
`;
}

// ---------- shared fragments ----------
export const logo = (t, R, size = 24, eager = false) => (t.image && /^https:\/\//.test(t.image) ? `<img class="tl" src="${esc(t.image)}" alt="" width="${size}" height="${size}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">` : `<span class="tl tl-x" aria-hidden="true">${esc((t.symbol || '?')[0])}</span>`);
const verdictBadge = (t) => (t.scan ? `<span class="v v-${esc(t.scan.verdict)}" title="Safety scan ${esc(date(t.scan.at))}">${esc(t.scan.verdict === 'DESK_PASS' ? 'PASS*' : t.scan.verdict)}</span>` : '');
export const tokenLabel = (t) => `${t.name || t.symbol || short(t.address)}${t.symbol ? ` (${t.symbol})` : ''}`;

/** Ranking table. cols: rank,name,price,1h,24h,7d,mcap,vol,liq,age,spark,chain */
export function table(rows, R, { cols = ['rank', 'name', 'price', 'ch1h', 'ch24h', 'ch7d', 'mcap', 'vol24', 'liq', 'spark'], start = 1, id = 'rank-table', caption } = {}) {
  const H = { rank: '#', name: 'Name', price: 'Price', ch1h: '1h', ch24h: '24h', ch6h: '6h', ch7d: '7d', mcap: 'Market cap', vol24: 'Volume 24h', liq: 'Liquidity', age: 'Age', spark: 'Last 7 days', chain: 'Chain', txns: 'Txns 24h' };
  const cell = (t, k, i) => {
    switch (k) {
      case 'rank': return `<td class="rk"><button class="star" data-star="${esc(t.id)}" aria-label="Add ${esc(t.symbol || '')} to watchlist">☆</button>${start + i}</td>`;
      case 'name': return `<th scope="row" class="nm"><a href="${R}${esc(t.path)}">${logo(t, R)}<span class="n">${esc(t.name || short(t.address))}</span> <span class="sym">${esc(t.symbol || '')}</span></a>${verdictBadge(t)}<span class="ch-tag">${esc(chainName(t.chain))}</span></th>`;
      case 'price': return `<td class="num" data-live="price" data-v="${t.priceUsd ?? ''}">${price(t.priceUsd)}</td>`;
      case 'spark': return `<td class="sp">${spark(t.spark)}</td>`;
      case 'age': return `<td class="num" data-v="${t.createdAt ? Date.parse(t.createdAt) : ''}">${age(t.createdAt)}</td>`;
      case 'chain': return `<td>${esc(chainName(t.chain))}</td>`;
      case 'txns': return `<td class="num" data-v="${(t.txns24h?.buys || 0) + (t.txns24h?.sells || 0)}">${t.txns24h ? num(t.txns24h.buys + t.txns24h.sells) : '—'}</td>`;
      case 'ch1h': case 'ch24h': case 'ch6h': case 'ch7d': return `<td class="num" data-live="${k}" data-v="${t[k] ?? ''}">${pct(t[k])}</td>`;
      default: return `<td class="num" data-live="${k}" data-v="${t[k] ?? ''}">${usd(t[k])}</td>`;
    }
  };
  return `<div class="tw"><table class="rt" id="${id}" data-sortable>${caption ? `<caption>${caption}</caption>` : ''}<thead><tr>${cols.map((k) => `<th scope="col" data-k="${k}"${['rank', 'name', 'spark'].includes(k) ? '' : ' class="num"'}>${H[k]}</th>`).join('')}</tr></thead><tbody>
${rows.map((t, i) => `<tr data-id="${esc(t.id)}"${t.address ? ` data-chain="${esc(t.chain)}" data-addr="${esc(t.address)}"` : ''}>${cols.map((k) => cell(t, k, i)).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
}

export const itemList = (c, rows, name) => ({ '@type': 'ItemList', name, numberOfItems: rows.length, itemListElement: rows.slice(0, 100).map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: c.site + t.path, name: tokenLabel(t) })) });
export const crumbsLd = (c, crumbs) => ({ '@type': 'BreadcrumbList', itemListElement: crumbs.map(([h, l], i) => ({ '@type': 'ListItem', position: i + 1, name: l, item: c.site + h })) });
export const website = (c) => ({ '@type': 'WebSite', '@id': c.site + '#website', url: c.site, name: SITE_NAME, publisher: { '@id': c.site + '#org' }, potentialAction: { '@type': 'SearchAction', target: c.site + 'search/?q={q}', 'query-input': 'required name=q' } });
export const org = (c) => ({ '@type': 'Organization', '@id': c.site + '#org', name: 'Blockchain Lab', url: 'https://blockchainlab.com', sameAs: ['https://github.com/Blockchains'] });

export { esc, price, usd, usdFull, pct, num, date, dateLong, age, spark, chainName, EXPLORER, short };
