# GitHub repos evaluated for memecoin-markets (updated 2026-10-13, v0.3 memecoin forks release)

Rule: prefer maintained, licensed, testable code. Depend or wrap; fork into Blockchains only when needed.
Nothing that snipes, bundles, front-runs or holds keys is integrated.

## Forked into Blockchains in v0.3 (memecoin data forks, all keyless)

Every fork below is read live from `raw.githubusercontent.com/Blockchains/<fork>` by the Pages build, the SDK or the tests. Features: [/pumpfun/](https://blockchains.github.io/memecoin-markets/pumpfun/), [/sell-depth/](https://blockchains.github.io/memecoin-markets/sell-depth/), [/token-lists/](https://blockchains.github.io/memecoin-markets/token-lists/) and the "Liquidity depth, launchpad & listings" card on every token page.

| Fork | Upstream | What it powers | Code | Proof |
|---|---|---|---|---|
| [Blockchains/pump-public-docs](https://github.com/Blockchains/pump-public-docs) | pump-fun/pump-public-docs | Official Anchor IDL (`idl/pump.json`) drives an IDL-based Borsh decoder: pump.fun bonding-curve progress, SOL raised, graduated flag, creator, mayhem mode — read on-chain with one `getMultipleAccounts` per 99 mints on a public RPC. `/pumpfun/` page, `v1/pumpfun.json`, token card, MCP `memecoin_pumpfun_curve`, SDK `pumpfun.bondingCurve()`. | `src/sources/pumpfun.js` | PDA derivation byte-for-byte vs `@solana/kit`; synthetic account from the fork IDL; MCP live (Fartcoin = graduated) |
| [Blockchains/raydium-sdk-V2](https://github.com/Blockchains/raydium-sdk-V2) | raydium-io/raydium-sdk-V2 | Raydium pools for each Solana token (AMM/CPMM/CLMM) with TVL, fee and **LP burn %**, TVL-weighted burned share. Token card, `v1/sell-depth.json`, MCP `memecoin_raydium_pools`. | `src/sources/raydium.js` | contract test: our host + route equal `BASE_HOST` + `POOL_SEARCH_MINT` in the fork's `src/api/url.ts`; MCP live (BONK) |
| [Blockchains/jupiter-quote-api-node](https://github.com/Blockchains/jupiter-quote-api-node) | jup-ag/jupiter-quote-api-node | Sell depth: % lost selling $1K / $10K into USDC via read-only Jupiter quotes. `/sell-depth/` ranking, token card, MCP `memecoin_sell_impact`. | `src/sources/jupiter.js` (`sellImpact`) | contract test: fields read exist in the fork's `generated/models/QuoteResponse.ts`; MCP live |
| [Blockchains/tokenLists](https://github.com/Blockchains/tokenLists) | SmolDapp/tokenLists (tokenlistooor) | "Listed on N token lists" for every EVM memecoin (1inch, CoinGecko, CoW Swap, LI.FI, ParaSwap, Etherscan, Ledger, Aerodrome, …). `/token-lists/`, `v1/token-lists.json`, MCP `memecoin_token_lists`. | `src/sources/lists.js` | MCP live (PEPE on CoinGecko list) |
| [Blockchains/default-token-list](https://github.com/Blockchains/default-token-list) | Uniswap/default-token-list | "Uniswap default list" badge (wallet-verified) per chain. | `src/sources/lists.js` | build log `ext.listed` |
| [Blockchains/scam-database](https://github.com/Blockchains/scam-database) | scamsniffer/scam-database | ScamSniffer scam addresses checked against every EVM contract + pool; scam domains against every token link. | `src/sources/lists.js` (`checkScam`) | unit test (address + parent-domain matching) |
| [Blockchains/eth-phishing-detect](https://github.com/Blockchains/eth-phishing-detect) | MetaMask/eth-phishing-detect | MetaMask blocklist (+ allow-list) added to the token-link check. | same | unit test (allow-list wins) |
| [Blockchains/web3icons](https://github.com/Blockchains/web3icons) | 0xa3k5/web3icons | SVG token logos keyed by CoinGecko id, self-hosted at `/logos/{id}.svg`; logo fallback + "Vector logo" link on token pages. | `scripts/lib/extras.mjs` | build log `ext.svgLogos` |

## Forked into Blockchains and operated by the Pages build (v0.2)

Each fork is read at build time from `raw.githubusercontent.com/Blockchains/<fork>` (upstream as fallback where noted), so the product keeps working if upstream disappears. Sync a fork with `gh repo sync Blockchains/<fork>` (or the GitHub "Sync fork" button).

| Fork | Upstream / licence | What it does in production | Code | Proof |
|---|---|---|---|---|
| [Blockchains/web3-defi-honeypot-and-slippage-checker](https://github.com/Blockchains/web3-defi-honeypot-and-slippage-checker) | valamidev/… · MIT | Independent on-chain honeypot + tax check: one read-only `eth_call` to the community `honeyCheck` contracts (Ethereum, Base, BSC, Arbitrum, Polygon, Avalanche) buys 0.5 native coin through a v2 router and sells back; caller funded by a state override, nothing signed. New `onchain_sim` check in every EVM scan. | `src/sources/honeysim.js` | `test/markets.test.mjs` (selector = keccak of the fork ABI, decoder vectors), `test/live.test.mjs` (PEPE simulated on mainnet) |
| [Blockchains/phishing](https://github.com/Blockchains/phishing) | polkadot-js/phishing · Apache-2.0 | ~55k-domain deny-list; every token website/social link is checked; flagged links show a warning on the token page and in `v1/token/*.json` (`linkCheck`). | `src/sources/phishing.js`, `scripts/lib/collect.mjs` | unit test (parent-domain + allow-list matching) |
| [Blockchains/assets](https://github.com/Blockchains/assets) | trustwallet/assets · MIT | EVM token website/socials fallback (`info.json`, EIP-55 path), 7-day rolling cache. | `scripts/lib/collect.mjs` | EIP-55 spec vectors in unit test |
| [Blockchains/token-list](https://github.com/Blockchains/token-list) | solana-labs/token-list · Apache-2.0 (archived) | Legacy Solana registry: logo + website/Twitter fallback for older SPL tokens. | `scripts/lib/collect.mjs` | build log |
| [Blockchains/rotki](https://github.com/Blockchains/rotki) | rotki/rotki · AGPL-3.0 | (v0.1) PnL exports rotki generic-trades CSV; contract test reads the fork's importer. | `src/pnl.js` | `test/live.test.mjs` |

## Vendored as dependencies (fork not justified: used unmodified from npm)

| Project | Licence | Use |
|---|---|---|
| [tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts) 5.x | Apache-2.0 | Interactive candlestick + volume chart on token pages, self-hosted at `/vendor/` (licence copied next to it; TradingView attribution logo kept on, footer link). |
| [Pagefind/pagefind](https://github.com/Pagefind/pagefind) | MIT | Static full-text search index over guides/categories/chains, built after the HTML (`/pagefind/`), used by `/search/`. |
| [paulmillr/noble-hashes](https://github.com/paulmillr/noble-hashes) | MIT | Build/test only: keccak-256 for EIP-55 paths and to verify the honeyCheck selector. |

## Free data APIs used by the rankings (zero keys)

| API | Use | Terms note |
|---|---|---|
| CoinGecko public API v3 (keyless) | meme universe, market cap, 1h/24h/7d, 7d sparkline, ATH, categories, contract addresses | attribution required — footer + methodology link "Data: CoinGecko"; keyless rate limits respected (7 s spacing, rotating categories) |
| DexScreener | pools, liquidity, DEX volume, socials, boosts (labelled paid), live prices in the browser | public API, rate limits respected |
| GeckoTerminal | trending/new pools, holders + distribution, Solana authorities, OHLCV | ~30 req/min — 2.2 s spacing + 429 back-off, 24 h rolling cache |

## Integrated (v0.1)

| Repo | Licence | How | Proof |
|---|---|---|---|
| [GoPlusSecurity/goplus-sdk-node](https://github.com/GoPlusSecurity/goplus-sdk-node) | Apache-2.0 | wrapped: same public `token_security` (EVM) and `solana/token_security` endpoints, browser-safe, no key | live test `scan PEPE`, scans in `v1/scans-solana.json` |
| [solana-program/token](https://github.com/solana-program/token) (`@solana-program/token`) | Apache-2.0 | dev dependency: our zero-dep Mint decoder is checked byte-for-byte against its codec | `test/unit.test.mjs` |
| [anza-xyz/kit](https://github.com/anza-xyz/kit) (`@solana/kit`) | MIT | dev dependency (address/option codecs for that test) | same |
| [grammyjs/grammY](https://github.com/grammyjs/grammY) | MIT | Telegram bot as a library: `examples/telegram-bot/bot.js` | `test/telegram.test.mjs` (real grammY update pipeline, API calls captured) |
| [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | MCP server `bin/memecoin-mcp.js` (12 tools) | `test/mcp.test.mjs` (stdio, live) |
| [Blockchains/rotki](https://github.com/Blockchains/rotki) (fork of rotki/rotki) | AGPL-3.0 | file-format integration only (no code copied): PnL exports rotki "generic trades" CSV | live contract test reads the fork's importer and asserts every column it reads is emitted |
| [Blockchains/blockchainlab-api](https://github.com/Blockchains/blockchainlab-api) | MIT | `rpc-health` picks the Solana RPC | live test |
| [Blockchains/onetouchswitch-bridge](https://github.com/Blockchains/onetouchswitch-bridge) | MIT | Chainlink GBP/USD for GBP portfolio values | live test |
| [Blockchains/blockchainlab-tools](https://github.com/Blockchains/blockchainlab-tools) | MIT | scanner links to approvals/revoke for EVM tokens | UI link |
| [Blockchains/solana-intel](https://github.com/Blockchains/solana-intel) | none | policy parity only (`policy-v1.1` bars) | `POLICY` |

Public APIs (not repos): DexScreener, GeckoTerminal, RugCheck, Jupiter lite API, honeypot.is, Solana/EVM publicnode RPCs.

## Considered, not integrated

| Repo / service | Why not |
|---|---|
| Birdeye public API | every endpoint needs an API key (returns 401 keyless) — excluded by the no-paid/no-key rule |
| GMGN (scrapers) | ToS forbids scraping; no public API — excluded |
| CoinMarketCap API | key required — excluded |
| DefiLlama/chainlist | not needed: chain RPCs come from Blockchains/blockchainlab-api |
| jup-ag/token-list | archived, no licence; Jupiter tokens API is used via HTTP instead |
| 0xJ1nn/dexscreener-python, DaniPopes/dexscreener (Rust) | MIT but wrong runtime; our zero-dep JS client covers the same endpoints |
| honeypot "checkers" bundled with snipers (e.g. Eclectic-Token-Sniper) | unlicensed and/or sniper/drainer code — rejected |
| raydium-io/raydium-sdk-V2 | GPL-3.0 and heavy; Jupiter already routes through Raydium for the sell probe |
| MeteoraAg/dlmm-sdk, jup-ag/jupiter-quote-api-node, pump-fun/pump-public-docs | no licence file — used only via public HTTP APIs/facts, no code copied |
| freqtrade (forked as Blockchains/freqtrade) | CEX bots; no Solana DEX support |
| hummingbot/hummingbot | Apache-2.0 but server-side market making; candidate for a later Gateway/Jupiter connector, not Pages |
| caxete/crypto-tax-calculator | AGPL-3.0, different jurisdiction model; UK CGT matching implemented here and tested by hand-computed cases |
| nirholas/pump-fun-sdk, assorted "memecoin trading bot", "sniper", "bundler", "pumpfun launcher" repos | no/unclear licence, unaudited key handling, several are known drainer patterns — excluded |
| DexLegion/isRug.API | AGPL-3.0 service; GoPlus + RugCheck + honeypot.is cover the same checks |

## Memecoin.markets gaps these close

- Honeypot evidence no longer depends on a single third-party API: honeypot.is + GoPlus + our own on-chain simulation.
- Token links are phishing-checked before we show them.
- Logos/socials survive when DexScreener has no profile (Trust Wallet + Solana registry forks).

## Rejected in the v0.3 search (2026-10-13)

| Candidate | Why not |
|---|---|
| pump.fun frontend API (`frontend-api-v3.pump.fun`) and scrapers of it | returns 403 to non-browser clients; scraping it would break ToS — we decode the chain with the official IDL instead |
| pump.fun / Raydium "sniper", "bundler", "volume bot" and copy-trade repos | trade automation that front-runs or manipulates launches — excluded by policy |
| Bubblemaps, Birdeye, Helius DAS, Moralis, Bitquery, Solscan Pro | API key or paid plan required |
| Meteora DLMM/DAMM public APIs | endpoints returned empty data keyless during testing; Meteora pools already reach us through DexScreener |
| rugcheck.xyz SDKs | no maintained public repo; the keyless RugCheck API is already used directly |
| jup-ag/token-list, spothq/cryptocurrency-icons | archived / unmaintained |
