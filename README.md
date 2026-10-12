# memecoin-markets

Free, open-source **CoinMarketCap-style memecoin tracker** for **[memecoin.markets](https://memecoin.markets)**: rankings by market cap, volume, liquidity, gainers/losers, trending and new pairs; a static, SEO-ready page for every token (`/token/{chain}/{address}/`) with price chart, holders, LP pools, links (phishing-checked) and a reproducible rug/honeypot scan; categories, chains, watchlist, compare, search and long-tail guides. Built from [Blockchains](https://github.com/Blockchains) blocks and forks. **No paid APIs, no API keys.**

**Site:** https://blockchains.github.io/memecoin-markets/ · **Tools:** [/tools/](https://blockchains.github.io/memecoin-markets/tools/) · **API:** https://blockchains.github.io/memecoin-markets/v1/index.json

## Rankings product (v0.2)

| Page | URL | Data |
|---|---|---|
| Top memecoins by market cap (paginated) | `/`, `/page/N/` | CoinGecko public API (keyless) + DexScreener liquidity |
| Volume · Liquidity · Gainers · Losers | `/volume/`, `/liquidity/`, `/gainers/`, `/losers/` | filtered so dust pairs and bad supply figures do not rank |
| Trending (organic) + boosted (paid, labelled) | `/trending/` | GeckoTerminal trending pools, DexScreener boosts |
| New pairs (72h, ≥ $1K liq) | `/new/` | GeckoTerminal new pools, DexScreener profiles |
| Token page | `/token/{chain}/{address}/`, `/coin/{id}/` | stats, 7d sparkline (no JS) + interactive OHLCV (Lightweight Charts), holders + distribution, all pools, socials (phishing-checked), safety scan (stored + live), related tokens |
| Categories · Chains | `/category/{slug}/`, `/chain/{chain}/` | CoinGecko categories |
| Watchlist · Compare · Search | `/watchlist/` (localStorage), `/compare/?ids=…` + static `X-vs-Y` pages, `/search/` (index + Pagefind + live DexScreener) | |
| Guides | `/guides/…` | best memecoins per chain (data-backed), UK memecoin tax, rug-pull checklist, honeypots, new Solana memecoins, mcap vs liquidity, pump.fun, dog vs cat vs frog |

SEO: unique title/description/canonical/OG/Twitter per page, JSON-LD (`WebSite`+`SearchAction`, `Organization`, `CollectionPage`+`ItemList`, `BreadcrumbList`, `FinancialProduct` per token, `Article` per guide), `sitemap.xml` (every indexable page), `robots.txt`, `llms.txt`, thin pages `noindex`. Canonical host switches to `https://memecoin.markets/` automatically once that domain serves this build (`/mm-origin.json`), or set the `SITE_URL` repo variable. Search Console meta tag via the `GSC_VERIFICATION` repo variable.

Refresh: GitHub Actions rebuilds every 30 minutes; holders/scans/pools/assets are refreshed on a rolling budget carried in `v1/state.json`, so free rate limits are respected. Offline: service worker keeps the shell, rankings, visited token pages, watchlist and the UK tax calculator.

## Toolkit (v0.1, now at `/tools/`)

| Feature | What it does | Data |
|---|---|---|
| Token safety scanner | Solana: mint/freeze authority, Token-2022 permanent delegate, transfer fee, transfer hook, default-frozen; EVM: buy+sell simulation (honeypot), taxes, hidden owner, mint/blacklist/pause, verified source. Both: liquidity vs desk bar, top-10 holders, LP lock, RugCheck risks, Jupiter sell route. Verdict `FAIL / INCOMPLETE / DESK_PASS / CLEAR` | Solana RPC (publicnode, picked via blockchainlab-api rpc-health), RugCheck, GoPlus, honeypot.is, on-chain `eth_call` simulation (Blockchains fork of the honeyCheck contracts), DexScreener, Jupiter |
| New-pair radar | Newest pools + DexScreener profiles/boosts, age, liquidity, 5m buys/sells, quick flags, RugCheck for liquid rows | GeckoTerminal, DexScreener, RugCheck |
| PnL / UK tax | HMRC same-day, 30-day ("bed and breakfast") and Section 104 matching per UK tax year with annual exempt amount; FIFO PnL; rotki CSV export | your CSV, on device |
| Launch checklist | Auto items from a live scan + manual items saved locally | scanner |
| Portfolio | Holdings valued in USD and GBP; wallet import with your RPC | Jupiter, Chainlink GBP/USD (onetouchswitch-bridge) |

Policy `policy-v1.1` matches the live desk: $150 pool liquidity bar, top-10 ≤ 80 %, mint and freeze clean. **A pass is not a buy. Not financial or tax advice.** Nothing here signs or trades.

## Use

```js
// Browser, from any origin (GitHub Pages serves CORS *):
import { scanToken, radar, ukCgt } from 'https://blockchains.github.io/memecoin-markets/lib/index.js';
// Node >= 20:
// npm i github:Blockchains/memecoin-markets
const s = await scanToken({ address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' });
console.log(s.verdict, s.checks.map((c) => `${c.status} ${c.id} (${c.source})`));
```

MCP (Grok, Cursor, Claude, VS Code):

```json
{ "mcpServers": { "memecoin": { "command": "npx", "args": ["-y", "github:Blockchains/memecoin-markets", "memecoin-mcp"] } } }
```

Telegram bot (grammY): `TELEGRAM_BOT_TOKEN=... node examples/telegram-bot/bot.js` → `/scan <address>`, `/new`.

## Tests

`npm test` (unit + live upstreams + MCP), `npm run test:e2e` (browser, incl. offline). CI runs gitleaks, unit, live, blocks.json schema and e2e; Pages runs a post-deploy e2e against the live URL. See [AGENTS.md](AGENTS.md), [docs/INTEGRATION.md](docs/INTEGRATION.md), [docs/REPOS.md](docs/REPOS.md).

Built by [Blockchain Lab](https://blockchainlab.com). MIT.
