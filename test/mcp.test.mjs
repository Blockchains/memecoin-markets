import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/memecoin-mcp.js', import.meta.url));
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const T = [{ time: '2025-01-01', side: 'buy', asset: 'BONK', qty: 100, total: 10 }, { time: '2025-03-01', side: 'sell', asset: 'BONK', qty: 50, total: 20 }];
const CALLS = {
  memecoin_scan_token: { address: BONK },
  memecoin_new_pairs: { chain: 'solana', limit: 10 },
  memecoin_launch_checklist: { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' },
  memecoin_jupiter_quote: { input_mint: 'So11111111111111111111111111111111111111112', output_mint: BONK, amount: '10000000' },
  memecoin_uk_cgt: { trades: T },
  memecoin_fifo_pnl: { trades: T },
  memecoin_rotki_csv: { trades: T },
  memecoin_pumpfun_curve: { mint: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump' },
  memecoin_raydium_pools: { mint: BONK },
  memecoin_sell_impact: { mint: BONK, sizes_usd: [1000] },
  memecoin_token_lists: { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' },
  memecoin_portfolio: { holdings: [{ mint: BONK, qty: 1000000 }] },
};

test('stdio MCP server lists and runs every tool live', async () => {
  const client = new Client({ name: 'memecoin-test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin] }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(CALLS).sort());
    for (const [name, args] of Object.entries(CALLS)) {
      const r = await client.callTool({ name, arguments: args });
      assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
      const text = r.content[0].text;
      if (name === 'memecoin_rotki_csv') { assert.match(text, /^Location,Spend Currency/); continue; }
      const body = JSON.parse(text);
      if (name === 'memecoin_scan_token') assert.equal(body.checks.find((c) => c.id === 'mint_authority').status, 'pass');
      if (name === 'memecoin_uk_cgt') assert.equal(body.disposals[0].gain, 15);
      if (name === 'memecoin_new_pairs') assert.ok(body.count > 0);
      if (name === 'memecoin_pumpfun_curve') assert.equal(body.curve.complete, true);
      if (name === 'memecoin_raydium_pools') assert.ok(body.count > 0 && body.tvl > 0);
      if (name === 'memecoin_sell_impact') assert.ok(body.sizes[0].lossPct < 5, JSON.stringify(body.sizes));
      if (name === 'memecoin_token_lists') assert.ok(body.listedOn.includes('coingecko'));
    }
  } finally { await client.close(); }
});
