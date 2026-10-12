# memecoin-markets

Free, client-side memecoin toolkit for **[memecoin.markets](https://memecoin.markets)** (memecoin.grok.me), built from [Blockchains](https://github.com/Blockchains) blocks.

**App:** https://blockchains.github.io/memecoin-markets/ · **API:** https://blockchains.github.io/memecoin-markets/v1/index.json

| Feature | What it does | Data |
|---|---|---|
| Token safety scanner | Solana: mint/freeze authority, Token-2022 permanent delegate, transfer fee, transfer hook, default-frozen; EVM: buy+sell simulation (honeypot), taxes, hidden owner, mint/blacklist/pause, verified source. Both: liquidity vs desk bar, top-10 holders, LP lock, RugCheck risks, Jupiter sell route. Verdict `FAIL / INCOMPLETE / DESK_PASS / CLEAR` | Solana RPC (publicnode, picked via blockchainlab-api rpc-health), RugCheck, GoPlus, honeypot.is, DexScreener, Jupiter |
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
