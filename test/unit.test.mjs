import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMintEncoder, getMintDecoder } from '@solana-program/token';
import { address, some, none } from '@solana/kit';
import { decodeMint } from '../src/sources/solana-rpc.js';
import { normalisePool } from '../src/sources/geckoterminal.js';
import { normalisePair } from '../src/sources/dexscreener.js';
import { ukCgt, fifoPnl, toRotkiCsv, parseTradesCsv, ukTaxYear, evaluateChecklist, isSolanaAddress, isEvmAddress, quickFlags } from '../src/index.js';

const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));

test('decodeMint matches @solana-program/token (Apache-2.0) encoder byte-for-byte', () => {
  const auth = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  for (const m of [
    { mintAuthority: some(address(auth)), supply: 8799436228988768248n, decimals: 5, isInitialized: true, freezeAuthority: none() },
    { mintAuthority: none(), supply: 1n, decimals: 9, isInitialized: true, freezeAuthority: some(address('So11111111111111111111111111111111111111112')) },
  ]) {
    const bytes = getMintEncoder().encode(m);
    const ours = decodeMint(bytes);
    const theirs = getMintDecoder().decode(bytes);
    assert.equal(ours.supply, theirs.supply.toString());
    assert.equal(ours.decimals, theirs.decimals);
    assert.equal(ours.mintAuthority, theirs.mintAuthority.__option === 'Some' ? theirs.mintAuthority.value : null);
    assert.equal(ours.freezeAuthority, theirs.freezeAuthority.__option === 'Some' ? theirs.freezeAuthority.value : null);
  }
});

test('GeckoTerminal + DexScreener normalisers on recorded live payloads', () => {
  const g = fx('gecko-new-pools.json');
  const p = normalisePool(g.data[0], g.included);
  assert.equal(p.network, 'solana');
  assert.ok(isSolanaAddress(p.base.address));
  assert.ok(p.createdAt && p.liquidityUsd != null);
  const d = normalisePair(fx('ds-bonk.json').pairs[0]);
  assert.equal(d.base.symbol, 'Bonk');
  assert.ok(d.liquidityUsd > 0 && d.txns24h.buys > 0);
});

test('address detection', () => {
  assert.ok(isSolanaAddress('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'));
  assert.ok(!isSolanaAddress('0x6982508145454Ce325dDbE47a25d4ec3d2311933'));
  assert.ok(isEvmAddress('0x6982508145454Ce325dDbE47a25d4ec3d2311933'));
});

test('UK tax year boundaries', () => {
  assert.equal(ukTaxYear('2025-04-05'), '2024/25');
  assert.equal(ukTaxYear('2025-04-06'), '2025/26');
  assert.equal(ukTaxYear('2026-01-01'), '2025/26');
});

const TRADES = [
  { time: '2024-05-01', side: 'buy', asset: 'WIF', qty: 1000, total: 1000 },
  { time: '2024-06-01', side: 'buy', asset: 'WIF', qty: 1000, total: 2990, fee: 10 },
  { time: '2024-07-01', side: 'sell', asset: 'WIF', qty: 500, total: 2510, fee: 10 },
  { time: '2024-07-15', side: 'buy', asset: 'WIF', qty: 300, total: 600 },
  { time: '2024-08-01', side: 'buy', asset: 'WIF', qty: 100, total: 50 },
  { time: '2024-08-01', side: 'sell', asset: 'WIF', qty: 100, total: 80 },
  { time: '2025-04-05', side: 'sell', asset: 'WIF', qty: 800, total: 4000 },
  { time: '2025-04-06', side: 'sell', asset: 'WIF', qty: 1000, total: 500 },
];

test('UK CGT: same-day, bed-and-breakfast and S104 matching (hand-computed)', () => {
  const r = ukCgt(TRADES);
  const by = Object.fromEntries(r.disposals.map((d) => [d.day, d]));
  // 2024-07-01: 300 matched to 15 Jul buy (B&B, £600) + 200 from pool @ £2 = £400
  assert.deepEqual(by['2024-07-01'].matches.map((m) => [m.rule, m.qty, m.cost]), [['bed-and-breakfast', 300, 600], ['s104', 200, 400]]);
  assert.equal(by['2024-07-01'].gain, 1500);
  assert.equal(by['2024-08-01'].matches[0].rule, 'same-day');
  assert.equal(by['2024-08-01'].gain, 30);
  assert.equal(by['2025-04-05'].gain, 2400);
  assert.equal(by['2025-04-06'].gain, -1500);
  const y = Object.fromEntries(r.taxYears.map((t) => [t.taxYear, t]));
  assert.equal(y['2024/25'].net, 3930);
  assert.equal(y['2024/25'].taxableAfterAEA, 930);
  assert.equal(y['2025/26'].losses, 1500);
  assert.equal(r.pools.WIF.qty, 0);
  assert.deepEqual(r.warnings, []);
});

test('UK CGT warns when selling more than the recorded history', () => {
  const r = ukCgt([{ time: '2025-01-01', side: 'sell', asset: 'X', qty: 5, total: 10 }]);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.disposals[0].gain, 10);
});

test('FIFO PnL', () => {
  const r = fifoPnl(TRADES);
  assert.equal(r.realised[0].cost, 500); // first 500 from the £1/unit lot
  assert.equal(r.realised[0].pnl, 2000);
  assert.equal(Math.round(r.open.WIF.qty), 0);
});

test('CSV round trip and rotki generic trades export', () => {
  const csv = 'time,side,asset,qty,total,fee,quoteAsset,quoteQty\n2025-01-02T10:00:00Z,buy,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263,1000000,20,0.1,SOL,0.12\n2025-01-03T10:00:00Z,sell,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263,1000000,30,0,SOL,0.2\n';
  const t = parseTradesCsv(csv);
  assert.equal(t.length, 2);
  const out = toRotkiCsv(t).trim().split('\n');
  assert.equal(out[0], 'Location,Spend Currency,Spend Amount,Receive Currency,Receive Amount,Fee,Fee Currency,Description,Timestamp');
  assert.equal(out[1].split(',').slice(0, 5).join(','), 'external,SOL,0.12,solana/token:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263,1000000');
  assert.equal(out[1].split(',')[8], String(Date.parse('2025-01-02T10:00:00Z')));
});

test('launch checklist maps scan checks', () => {
  const scan = { chain: 'solana', market: { socials: ['https://x.com/a'] }, checks: [
    { id: 'mint_authority', status: 'pass', value: 'none', source: 'solana-rpc' },
    { id: 'freeze_authority', status: 'fail', value: 'Abc', source: 'solana-rpc' },
    { id: 'liquidity', status: 'warn', value: 900, source: 'dexscreener' },
  ] };
  const c = Object.fromEntries(evaluateChecklist(scan).map((x) => [x.id, x.state]));
  assert.equal(c.mint_authority, 'done');
  assert.equal(c.freeze_authority, 'todo');
  assert.equal(c.liquidity, 'todo');
  assert.equal(c.socials, 'done');
  assert.equal(c.honeypot, 'n/a');
  assert.equal(c.disclosure, 'manual');
});

test('radar quick flags', () => {
  assert.deepEqual(quickFlags({ liquidityUsd: 10, txns5m: { buys: 9, sells: 0 } }), ['below desk liquidity bar', 'no sells in 5m']);
});

test('buy/sell swap deep links', async () => {
  const { swapLinks, swapCta } = await import('../scripts/lib/swap.mjs');
  const s = swapLinks({ chain: 'solana', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' });
  assert.match(s.buy, /^https:\/\/jup\.ag\/swap\?sell=So1+2&buy=DezX/);
  assert.match(s.sell, /sell=DezX.*&buy=So1/);
  const e = swapLinks({ chain: 'base', address: '0x' + 'a'.repeat(40) });
  assert.match(e.buy, /app\.uniswap\.org\/swap\?chain=base&inputCurrency=NATIVE&outputCurrency=0xa/);
  assert.equal(swapLinks({ chain: 'ton', address: 'EQabc' }), null);
  assert.match(swapCta({ id: 'x' }, '../', (x) => x), /compare\/\?ids=x">Compare/);
});
