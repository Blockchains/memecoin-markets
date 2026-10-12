# GitHub repos evaluated for memecoin-markets (2026-10-12)

Rule: prefer maintained, licensed, testable code. Depend or wrap; fork into Blockchains only when needed.
Nothing that snipes, bundles, front-runs or holds keys is integrated.

## Integrated

| Repo | Licence | How | Proof |
|---|---|---|---|
| [GoPlusSecurity/goplus-sdk-node](https://github.com/GoPlusSecurity/goplus-sdk-node) | Apache-2.0 | wrapped: same public `token_security` (EVM) and `solana/token_security` endpoints, browser-safe, no key | live test `scan PEPE`, scans in `v1/scans-solana.json` |
| [solana-program/token](https://github.com/solana-program/token) (`@solana-program/token`) | Apache-2.0 | dev dependency: our zero-dep Mint decoder is checked byte-for-byte against its codec | `test/unit.test.mjs` |
| [anza-xyz/kit](https://github.com/anza-xyz/kit) (`@solana/kit`) | MIT | dev dependency (address/option codecs for that test) | same |
| [grammyjs/grammY](https://github.com/grammyjs/grammY) | MIT | Telegram bot as a library: `examples/telegram-bot/bot.js` | `test/telegram.test.mjs` (real grammY update pipeline, API calls captured) |
| [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | MCP server `bin/memecoin-mcp.js` (8 tools) | `test/mcp.test.mjs` (stdio, live) |
| [Blockchains/rotki](https://github.com/Blockchains/rotki) (fork of rotki/rotki) | AGPL-3.0 | file-format integration only (no code copied): PnL exports rotki "generic trades" CSV | live contract test reads the fork's importer and asserts every column it reads is emitted |
| [Blockchains/blockchainlab-api](https://github.com/Blockchains/blockchainlab-api) | MIT | `rpc-health` picks the Solana RPC | live test |
| [Blockchains/onetouchswitch-bridge](https://github.com/Blockchains/onetouchswitch-bridge) | MIT | Chainlink GBP/USD for GBP portfolio values | live test |
| [Blockchains/blockchainlab-tools](https://github.com/Blockchains/blockchainlab-tools) | MIT | scanner links to approvals/revoke for EVM tokens | UI link |
| [Blockchains/solana-intel](https://github.com/Blockchains/solana-intel) | none | policy parity only (`policy-v1.1` bars) | `POLICY` |

Public APIs (not repos): DexScreener, GeckoTerminal, RugCheck, Jupiter lite API, honeypot.is, Solana/EVM publicnode RPCs.

## Considered, not integrated

| Repo | Why not |
|---|---|
| raydium-io/raydium-sdk-V2 | GPL-3.0 and heavy; Jupiter already routes through Raydium for the sell probe |
| MeteoraAg/dlmm-sdk, jup-ag/jupiter-quote-api-node, pump-fun/pump-public-docs | no licence file — used only via public HTTP APIs/facts, no code copied |
| freqtrade (forked as Blockchains/freqtrade) | CEX bots; no Solana DEX support |
| hummingbot/hummingbot | Apache-2.0 but server-side market making; candidate for a later Gateway/Jupiter connector, not Pages |
| caxete/crypto-tax-calculator | AGPL-3.0, different jurisdiction model; UK CGT matching implemented here and tested by hand-computed cases |
| nirholas/pump-fun-sdk, assorted "memecoin trading bot", "sniper", "bundler", "pumpfun launcher" repos | no/unclear licence, unaudited key handling, several are known drainer patterns — excluded |
| DexLegion/isRug.API | AGPL-3.0 service; GoPlus + RugCheck + honeypot.is cover the same checks |
