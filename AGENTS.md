# AGENTS.md: memecoin-markets

Instructions for AI coding agents (Grok, Cursor, Claude Code, Codex, Copilot and others) working **in** this repo or **using it as a building block**. Humans: see [README.md](README.md).

## What this is

Memecoin safety + desk toolkit behind memecoin.markets / memecoin.grok.me: token safety scanner (Solana mint/freeze authority, Token-2022 permanent delegate/fees/hooks; EVM honeypot simulation, taxes, owner powers), new-pair radar, UK CGT (same-day / 30-day / Section 104) + FIFO PnL with rotki export, launch checklist, portfolio valuation. Zero-dependency ES module SDK (browser + Node 20), read-only MCP server, static JSON API and a GitHub Pages app.

- Kind: library, mcp-server, http-api, dataset, web-app · stability: `beta` · licence: MIT
- Manifest: [`blocks.json`](blocks.json) (schema: [BLOCKS-SCHEMA](https://github.com/Blockchains/.github/blob/main/docs/BLOCKS-SCHEMA.md))
- How it fits with the other Blockchains repos: [Build with Blocks](https://github.com/Blockchains/.github/blob/main/docs/BUILD-WITH-BLOCKS.md)

## Rankings product (v0.2)

- `scripts/build-site.mjs` → `scripts/lib/collect.mjs` (data, rolling caches in `v1/state.json`), `pages.mjs` / `token-page.mjs` / `guides.mjs` / `render.mjs` (static HTML, relative links), `web/site.js` (progressive enhancement: watchlist, sort, live prices, search, compare, chart, live scan), `web/sw.js` (offline).
- Budgets via env: `CG_PAGES`, `CG_CATS_PER_BUILD`, `GT_BUDGET`, `POOLS_BUDGET`, `ASSETS_BUDGET`, `SCAN_BUDGET`, `MAX_SCANS`; `OFFLINE=1 PREV_STATE_FILE=state.json` renders from a saved state without network.
- No paid APIs or keys, ever. Birdeye/GMGN/CMC are excluded (see docs/REPOS.md).

## Rules

- Real data only. No mocks in live/e2e tests; unit tests use payloads recorded from the real APIs (`test/fixtures/`).
- Read-only. Nothing here signs, sends or trades. No sniping/bundling/MEV code, no private keys, no API keys.
- Every check carries `source`. A verdict is evidence, never advice — keep "not a buy" wording.
- `src/` must stay dependency-free and browser-safe (it is served as-is at `/lib/`). Escape every upstream string before putting it in HTML.
- Policy numbers live in `POLICY` (`src/scan.js`) and must match the live desk (`policy-v1.1`).

## Setup / build / test

```bash
npm ci
npm run test:unit         # offline: decoder vs @solana-program/token, CGT hand-computed cases, normalisers, grammY bot
npm run test:live         # live upstreams + MCP stdio (8 tools) + rotki contract test against Blockchains/rotki
npm run build:site        # _site/ with /lib (SDK), /v1 snapshots (real data)
CHROME_PATH=/usr/bin/google-chrome npm run test:e2e   # browser e2e incl. offline (service worker)
E2E_URL=https://blockchains.github.io/memecoin-markets/ npm run test:e2e   # against live Pages
```

## Structure

| Path | What |
|---|---|
| `src/sources/*` | one file per upstream (dexscreener, geckoterminal, rugcheck, goplus, honeypot, jupiter, solana-rpc) |
| `src/scan.js` | `scanToken` + `POLICY` |
| `src/radar.js` | `radar` new-pair feed |
| `src/pnl.js` | `ukCgt`, `fifoPnl`, `parseTradesCsv`, `toRotkiCsv` |
| `src/checklist.js` | launch checklist |
| `src/portfolio.js` | Jupiter prices, GBP via onetouchswitch-bridge, wallet import |
| `bin/memecoin-mcp.js` | MCP stdio server |
| `web/` | Pages app (copied to `_site/`, SDK to `_site/lib/`) |
| `scripts/build-site.mjs` | builds `_site` + `/v1` JSON snapshots |
| `examples/telegram-bot/` | grammY bot using the SDK |
| `docs/INTEGRATION.md` | how memecoin.grok.me loads these assets |
| `docs/REPOS.md` | which GitHub repos were integrated, wrapped or rejected and why |
