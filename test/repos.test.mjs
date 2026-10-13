// v0.3 memecoin repo forks: offline decoder/logic tests + contract tests that read the Blockchains forks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProgramDerivedAddress, getAddressEncoder, address as kitAddress } from '@solana/kit';
import { findProgramAddress, bondingCurveAddress, base58Decode, decodeAccount, curveStats, PUMP_PROGRAM, PUMP_IDL_URLS, isOnCurve } from '../src/sources/pumpfun.js';
import { base58 } from '../src/sources/solana-rpc.js';
import { summariseRaydium, normaliseRaydiumPool, RAYDIUM_API, RAYDIUM_SDK_URLS_TS } from '../src/sources/raydium.js';
import { checkScam, CHAIN_ID } from '../src/sources/lists.js';
import { extCard } from '../scripts/lib/ext-pages.mjs';

const FART = '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump';
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

test('base58 decode/encode round-trips', () => {
  for (const a of [FART, BONK, PUMP_PROGRAM, '11111111111111111111111111111111']) assert.equal(base58(base58Decode(a)), a);
});

test('pump.fun PDA derivation matches @solana/kit getProgramDerivedAddress byte-for-byte', async () => {
  const enc = getAddressEncoder();
  for (const mint of [FART, BONK]) {
    const [kit, kitBump] = await getProgramDerivedAddress({ programAddress: kitAddress(PUMP_PROGRAM), seeds: ['bonding-curve', enc.encode(kitAddress(mint))] });
    const [ours, bump] = await findProgramAddress(['bonding-curve', base58Decode(mint)], PUMP_PROGRAM);
    assert.equal(ours, kit); assert.equal(bump, kitBump);
    assert.equal(await bondingCurveAddress(mint), kit);
  }
  const [g] = await getProgramDerivedAddress({ programAddress: kitAddress(PUMP_PROGRAM), seeds: ['global'] });
  assert.equal((await findProgramAddress(['global'], PUMP_PROGRAM))[0], g);
  assert.equal(isOnCurve(base58Decode(PUMP_PROGRAM)), true); // program ids are curve points
});

test('IDL-driven decoder reads a synthetic BondingCurve built from the fork IDL; truncated accounts decode partially', async () => {
  const idl = await (await fetch(PUMP_IDL_URLS[0])).json();
  assert.equal(idl.address, PUMP_PROGRAM);
  const disc = idl.accounts.find((a) => a.name === 'BondingCurve').discriminator;
  const fields = idl.types.find((t) => t.name === 'BondingCurve').type.fields.map((f) => f.name);
  assert.deepEqual(fields.slice(0, 7), ['virtual_token_reserves', 'virtual_quote_reserves', 'real_token_reserves', 'real_quote_reserves', 'token_total_supply', 'complete', 'creator']);
  const b = new Uint8Array(8 + 8 * 5 + 1 + 32); b.set(disc, 0);
  const dv = new DataView(b.buffer);
  const vals = [1073000000000000n, 30000000000n, 396550000000000n, 42000000000n, 1000000000000000n];
  vals.forEach((v, i) => dv.setBigUint64(8 + i * 8, v, true));
  b[48] = 0; b.set(base58Decode(BONK), 49);
  const c = decodeAccount(idl, 'BondingCurve', b);
  assert.equal(c.real_token_reserves, 396550000000000n); assert.equal(c.complete, false); assert.equal(c.creator, BONK);
  assert.equal(c.is_mayhem_mode, undefined); // past the end of a short (older) account
  const s = curveStats(c, 793100000000000n);
  assert.equal(s.progressPct, 50); assert.equal(s.solRaised, 42);
  assert.throws(() => decodeAccount(idl, 'Global', b), /discriminator/);
});

test('Raydium: our route equals the Raydium SDK fork (BASE_HOST + POOL_SEARCH_MINT); LP burn is TVL-weighted', async () => {
  const ts = await (await fetch(RAYDIUM_SDK_URLS_TS)).text();
  assert.match(ts, new RegExp(`BASE_HOST:\\s*"${RAYDIUM_API.BASE_HOST.replace(/[./]/g, '\\$&')}"`));
  assert.match(ts, new RegExp(`POOL_SEARCH_MINT:\\s*"${RAYDIUM_API.POOL_SEARCH_MINT.replace(/\//g, '\\/')}"`));
  const p = normaliseRaydiumPool({ id: 'x', type: 'Standard', mintA: { address: BONK }, mintB: { address: 'So1', symbol: 'WSOL' }, tvl: 100, day: { volume: 5 }, feeRate: 0.0025, burnPercent: 100 }, BONK);
  assert.equal(p.quote, 'WSOL');
  const s = summariseRaydium([p, { ...p, tvl: 300, burnPercent: 0 }]);
  assert.equal(s.burnedPct, 25); assert.equal(s.tvl, 400);
});

test('Jupiter contract: fields we read exist in the Blockchains/jupiter-quote-api-node QuoteResponse model', async () => {
  const ts = await (await fetch('https://raw.githubusercontent.com/Blockchains/jupiter-quote-api-node/main/generated/models/QuoteResponse.ts')).text();
  for (const f of ['inAmount', 'outAmount', 'priceImpactPct', 'routePlan']) assert.match(ts, new RegExp(`\\b${f}\\b`), f);
});

test('scam lists: address + parent-domain matching, MetaMask allow-list wins', () => {
  const lists = { addresses: new Set(['0xbad']), scamDomains: new Set(['evil.xyz']), metamaskDeny: new Set(['phish.io']), metamaskAllow: new Set(['ok.phish.io']) };
  const r = checkScam({ addresses: ['0xBAD', '0xgood'], urls: ['https://app.evil.xyz/x', 'https://www.phish.io', 'https://ok.phish.io', 'https://pepe.vip', 'https://sites.google.com/view/x'] }, { ...lists, scamDomains: new Set([...lists.scamDomains, 'sites.google.com']) });
  assert.deepEqual(r.addressHits, ['0xbad']);
  assert.deepEqual(r.domainHits, [{ host: 'app.evil.xyz', list: 'scam-database' }, { host: 'phish.io', list: 'eth-phishing-detect' }]);
  assert.equal(CHAIN_ID.base, 8453);
});

test('token page card renders every v0.3 block', () => {
  const html = extCard({ symbol: 'X', pumpfun: { complete: false, progressPct: 42.5, solRaised: 12.3, bondingCurve: BONK, creator: BONK }, raydium: { count: 1, tvl: 1000, vol24: 10, burnedPct: 100, pools: [{ url: 'https://raydium.io', quote: 'SOL', type: 'Standard', tvl: 1000, vol24: 10, feeRate: 0.0025, burnPercent: 100 }] }, sellImpact: { at: Date.now(), sizes: [{ usd: 1000, outUsdc: 990, lossPct: 1, routes: ['Raydium'] }] }, lists: ['coingecko'], scamCheck: { addressHits: [], domainHits: [], checkedAddresses: 2, checkedHosts: 1 }, logoSvg: 'logos/x.svg' }, '../');
  for (const s of ['bonding curve', '42.5%', 'LP burn', 'How much can you sell', 'Token-list coverage', 'Scam-list check', 'Vector (SVG) logo']) assert.ok(html.includes(s), s);
});
