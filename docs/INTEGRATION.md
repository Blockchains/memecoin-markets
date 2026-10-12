# How memecoin.markets / memecoin.grok.me uses these assets

memecoin.markets is a Grok Build app (TanStack Start SSR; data via `/_serverFn/*`). It runs on
memecoin.grok.me and memecoin.markets (same deployment). Audit of the live site on 2026-10-12:

| Area | Live today | Gap | Fixed by this repo |
|---|---|---|---|
| Discovery | DexScreener boosts + pairs via server functions | GeckoTerminal new-pool feed shows `DEGRADED · HTTP missed` | `v1/radar-solana.json` (GeckoTerminal + DexScreener, rebuilt by Actions) or `radar()` in the browser |
| Safety | rows show `mint authority / freeze authority / holder concentration` as **UNRESOLVED** on passed coins | no on-chain mint read | `v1/scans-solana.json` keyed by mint (latest boosts + fresh pools) and `scanToken()` for any mint |
| Sources panel | bundle still labels `solana-rpc` and `dexscreener` as "Blocked" | stale copy | report each check's `source` |
| SEO / agents | no robots.txt, sitemap, llms.txt or public API | — | Pages ships all four; site can link them |
| Tax / PnL, checklist, portfolio | not present | — | Pages app tabs + SDK functions |

## Three ways to load (all CORS `*`, no keys)

1. **Server function fetch (recommended for SSR rows).** In the existing server function that builds the desk book,
   fetch `https://blockchains.github.io/memecoin-markets/v1/scans-solana.json` once per refresh and merge
   `by_address[mint].checks` into each row. Fall back to the current behaviour on any error.
2. **Browser ES module (for on-demand scans).** In a client component:
   ```js
   const { scanToken } = await import(/* @vite-ignore */ 'https://blockchains.github.io/memecoin-markets/lib/index.js');
   const s = await scanToken({ address: mint, chain: 'solana' });
   ```
   The module only calls CORS-enabled public APIs (publicnode Solana RPC, RugCheck, GoPlus, Jupiter, DexScreener).
3. **Embed.** `https://blockchains.github.io/memecoin-markets/?embed=1#scan?address=<mint>` hides the header for an iframe;
   `#pnl`, `#checklist?address=`, `#radar`, `#portfolio` work the same way.

Freshness: Pages rebuilds every 30 minutes (`schedule` in `.github/workflows/pages.yml`) and on push. Each JSON has
`generated_at`; treat anything older than 2 h as stale and fall back to a live `scanToken()`.

## Queued Build paste (after the weekly Build limit resets, ~15 Oct 2026)

See `/workspace/memecoin-markets-build-paste.txt` on the operator box (also reproduced in the integration report).
No Build changes are made before then.
