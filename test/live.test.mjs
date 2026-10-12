// Live tests: real public upstreams, no mocks. Run serially to stay polite on free rate limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanToken, radar, valuePortfolio, walletHoldings, evaluateChecklist, toRotkiCsv, POLICY } from '../src/index.js';
import { quote, SOL_MINT } from '../src/sources/jupiter.js';
import { getMint, solanaRpcCandidates } from '../src/sources/solana-rpc.js';

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const byId = (s) => Object.fromEntries(s.checks.map((c) => [c.id, c]));

test('Solana RPC candidates come from Blockchains/blockchainlab-api rpc-health', async () => {
  const c = await solanaRpcCandidates();
  assert.ok(c.length >= 1 && c.every((u) => u.startsWith('https://')));
  const m = await getMint(BONK);
  assert.equal(m.isMint, true);
  assert.equal(m.decimals, 5);
  assert.equal(m.mintAuthority, null);
});

test('scan BONK (Solana): authorities revoked, liquid, sellable', async () => {
  const s = await scanToken({ address: BONK });
  const c = byId(s);
  assert.equal(s.chain, 'solana');
  assert.equal(c.mint_authority.status, 'pass');
  assert.equal(c.freeze_authority.status, 'pass');
  assert.equal(c.permanent_delegate.status, 'pass');
  assert.equal(c.liquidity.status, 'pass');
  assert.equal(c.sell_route.status === 'fail', false, c.sell_route.value);
  assert.ok(['CLEAR', 'DESK_PASS'].includes(s.verdict), s.verdict + JSON.stringify(s.errors));
  assert.equal(s.policy, POLICY.id);
});

test('scan USDC mint (Solana): live mint + freeze authority are measured as hard fails', async () => {
  const s = await scanToken({ address: USDC });
  const c = byId(s);
  assert.equal(c.mint_authority.status, 'fail');
  assert.equal(c.freeze_authority.status, 'fail');
  assert.equal(s.verdict, 'FAIL');
});

test('scan PEPE (Ethereum): not a honeypot, 0% tax, renounced', async () => {
  const s = await scanToken({ address: PEPE });
  const c = byId(s);
  assert.equal(s.chain, 'ethereum');
  assert.equal(c.honeypot.status, 'pass');
  assert.equal(c.tax.status, 'pass');
  assert.equal(c.owner.status, 'pass');
  assert.ok(s.market.liquidityUsd > 100000);
  const cl = evaluateChecklist(s);
  assert.equal(cl.find((x) => x.id === 'honeypot').state, 'done');
});

test('new-pair radar returns fresh Solana pools with ages and flags', async () => {
  const r = await radar({ chain: 'solana', limit: 30, rugcheck: 2 });
  assert.ok(r.count >= 5, JSON.stringify(r.errors));
  const fresh = r.rows.filter((x) => x.ageMin != null && x.ageMin < 24 * 60);
  assert.ok(fresh.length >= 3, 'expected pools younger than 24h');
  assert.ok(r.rows.every((x) => Array.isArray(x.flags) && x.address));
});

test('Jupiter quote SOL -> BONK has a route', async () => {
  const q = await quote(SOL_MINT, BONK, '100000000');
  assert.ok(BigInt(q.outAmount) > 0n);
  assert.ok(q.routes.length >= 1);
});

test('portfolio values holdings in USD and GBP (Chainlink via onetouchswitch-bridge)', async () => {
  const p = await valuePortfolio([{ mint: BONK, qty: 1_000_000 }, { mint: SOL_MINT, qty: 1 }], { gbp: true });
  assert.ok(p.totalUsd > 0);
  assert.ok(p.gbpUsd.rate > 1 && p.gbpUsd.rate < 2);
  assert.ok(p.totalGbp < p.totalUsd);
});

test('wallet import reads SPL/Token-2022 balances (Node, mainnet-beta)', async () => {
  const h = await walletHoldings('9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw');
  assert.ok(h.length > 0 && h.every((x) => x.qty > 0));
});

test('rotki contract: every column the Blockchains/rotki generic-trades importer reads is in our CSV', async () => {
  const raw = 'https://raw.githubusercontent.com/Blockchains/rotki/develop/rotkehlchen/data_import';
  const trades = await (await fetch(`${raw}/importers/rotki_trades.py`)).text();
  const utils = await (await fetch(`${raw}/utils.py`)).text();
  const fn = utils.slice(utils.indexOf('def process_rotki_generic_import_csv_fields'), utils.indexOf('\ndef ', utils.indexOf('def process_rotki_generic_import_csv_fields') + 10));
  const cols = new Set([...(trades + fn).matchAll(/csv_row\['([^']+)'\]/g)].map((m) => m[1]));
  assert.ok(cols.has('Spend Amount') && cols.has('Timestamp'), 'importer columns not found upstream');
  const ours = new Set(toRotkiCsv([{ time: '2025-01-01', side: 'buy', asset: 'X', qty: 1, total: 1 }]).split('\n')[0].split(','));
  for (const c of cols) assert.ok(ours.has(c), `rotki reads "${c}" which we do not emit`);
});
