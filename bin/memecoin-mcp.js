#!/usr/bin/env node
// memecoin-mcp: read-only MCP server (stdio) for memecoin.markets. Never signs, never trades.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { scanToken, radar, evaluateChecklist, ukCgt, fifoPnl, toRotkiCsv, valuePortfolio, walletHoldings, SUPPORTED_CHAINS } from '../src/index.js';
import { quote } from '../src/sources/jupiter.js';
import { readFileSync } from 'node:fs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const trade = z.object({ time: z.string(), side: z.enum(['buy', 'sell']), asset: z.string(), qty: z.number().positive(), total: z.number().nonnegative(), fee: z.number().nonnegative().optional(), quoteAsset: z.string().optional(), quoteQty: z.number().optional(), note: z.string().optional() });

export function createServer() {
  const s = new McpServer({ name: 'memecoin-markets', version: VERSION });
  const ro = { readOnlyHint: true, openWorldHint: true };
  const pure = { readOnlyHint: true, openWorldHint: false };
  const guard = (fn) => async (args) => { try { const v = await fn(args ?? {}); return { content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] }; } catch (e) { return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] }; } };
  const chain = z.enum(SUPPORTED_CHAINS);
  s.registerTool('memecoin_scan_token', { title: 'Token safety scan', description: 'Safety evidence for a Solana mint or EVM token: mint/freeze authority, Token-2022 permanent delegate/fees/hooks (Solana RPC), honeypot + buy/sell tax simulation (honeypot.is, GoPlus), liquidity (DexScreener), top-10 holders, RugCheck risks, LP lock, Jupiter sell route. Verdict FAIL/INCOMPLETE/DESK_PASS/CLEAR under policy-v1.1. Not advice.', inputSchema: { address: z.string(), chain: chain.optional() }, annotations: ro }, guard(({ address, chain }) => scanToken({ address, chain })));
  s.registerTool('memecoin_new_pairs', { title: 'New-pair radar', description: 'Newest pools (GeckoTerminal) merged with DexScreener latest profiles and boosts, with liquidity, 5m txns, age and quick flags; Solana rows can include RugCheck summaries.', inputSchema: { chain: chain.optional(), limit: z.number().int().min(1).max(100).optional(), rugcheck: z.number().int().min(0).max(10).optional() }, annotations: ro }, guard(({ chain, limit, rugcheck }) => radar({ chain, limit, rugcheck })));
  s.registerTool('memecoin_launch_checklist', { title: 'Launch checklist', description: 'Scan a token and evaluate the launch checklist (authorities revoked, LP locked, taxes, holders, socials) plus the manual items a team must do.', inputSchema: { address: z.string(), chain: chain.optional() }, annotations: ro }, guard(async ({ address, chain }) => { const sc = await scanToken({ address, chain }); return { verdict: sc.verdict, token: sc.token, checklist: evaluateChecklist(sc) }; }));
  s.registerTool('memecoin_jupiter_quote', { title: 'Jupiter quote (read-only)', description: 'ExactIn swap quote from Jupiter lite API: out amount, price impact, route labels. Does not build or sign a transaction.', inputSchema: { input_mint: z.string(), output_mint: z.string(), amount: z.string().regex(/^\d+$/), slippage_bps: z.number().int().min(1).max(5000).optional() }, annotations: ro }, guard(({ input_mint, output_mint, amount, slippage_bps }) => quote(input_mint, output_mint, amount, slippage_bps)));
  s.registerTool('memecoin_uk_cgt', { title: 'UK CGT matching', description: 'HMRC same-day, 30-day and Section 104 matching for token trades valued in GBP; gains/losses per UK tax year with the annual exempt amount. Arithmetic aid, not tax advice.', inputSchema: { trades: z.array(trade).min(1) }, annotations: pure }, guard(({ trades }) => ukCgt(trades)));
  s.registerTool('memecoin_fifo_pnl', { title: 'FIFO PnL', description: 'Realised FIFO PnL and open lots for token trades.', inputSchema: { trades: z.array(trade).min(1) }, annotations: pure }, guard(({ trades }) => fifoPnl(trades)));
  s.registerTool('memecoin_rotki_csv', { title: 'Export to rotki', description: "Convert trades to rotki's 'generic trades' CSV import format.", inputSchema: { trades: z.array(trade).min(1), currency: z.string().optional() }, annotations: pure }, guard(({ trades, currency }) => toRotkiCsv(trades, { currency })));
  s.registerTool('memecoin_portfolio', { title: 'Portfolio value', description: 'Value Solana holdings with Jupiter prices (USD and GBP via Chainlink GBP/USD). Pass holdings, or a wallet address to read SPL + Token-2022 balances.', inputSchema: { holdings: z.array(z.object({ mint: z.string(), qty: z.number().nonnegative() })).optional(), wallet: z.string().optional(), rpc: z.string().url().optional() }, annotations: ro }, guard(async ({ holdings, wallet, rpc }) => { let h = holdings || []; if (wallet) h = [...h, ...(await walletHoldings(wallet, rpc ? { rpc } : {}))]; return valuePortfolio(h.slice(0, 50), { gbp: true }); }));
  return s;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('memecoin-mcp')) {
  await createServer().connect(new StdioServerTransport());
}
