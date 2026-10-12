// Unit tests for the rankings product: no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { HONEY_SELECTOR, encodeHoneyCheck, decodeHoneyResult, TEST_WEI } from '../src/sources/honeysim.js';
import { checkUrls, hostOf } from '../src/sources/phishing.js';
import { primaryContract, normaliseMarket } from '../src/sources/coingecko.js';
import { price, usd, spark } from '../scripts/lib/format.mjs';
import { checksum } from '../scripts/lib/collect.mjs';
import { buildData } from '../scripts/lib/pages.mjs';
import { tokenPage, indexable } from '../scripts/lib/token-page.mjs';

test('honeyCheck selector matches keccak256 of the fork ABI signature', () => {
  assert.equal(HONEY_SELECTOR, '0x' + bytesToHex(keccak_256('honeyCheck(address,address)')).slice(0, 8));
  const data = encodeHoneyCheck('0x6982508145454Ce325dDbE47a25d4ec3d2311933', '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D');
  assert.equal(data.length, 2 + 8 + 128);
  assert.match(data, /6982508145454ce325ddbe47a25d4ec3d2311933/);
});

test('decodeHoneyResult: clean token, taxed token, honeypot', () => {
  const w = (n) => BigInt(n).toString(16).padStart(64, '0');
  const enc = (buy, sell, exp) => '0x' + [buy, 0, sell, 90000, 40000, exp].map(w).join('');
  const clean = decodeHoneyResult(enc(1000n, (TEST_WEI * 994n) / 1000n, 1000n));
  assert.equal(clean.honeypot, false); assert.equal(clean.buyTaxPct, 0); assert.ok(Math.abs(clean.roundTripLossPct - 0.6) < 1e-9);
  const taxed = decodeHoneyResult(enc(900n, (TEST_WEI * 80n) / 100n, 1000n));
  assert.equal(taxed.buyTaxPct, 10); assert.equal(taxed.sellTaxPct, 10);
  assert.equal(decodeHoneyResult(enc(1000n, 0n, 1000n)).honeypot, true);
  assert.throws(() => decodeHoneyResult('0x00'));
});

test('phishing deny-list matches parent domains and respects allow', () => {
  const list = { deny: new Set(['evil.com', 'scam.io']), allow: new Set(['ok.scam.io']) };
  assert.deepEqual(checkUrls(['https://www.evil.com/x', 'https://app.evil.com', 'https://ok.scam.io', 'https://good.org'], list).flagged, ['evil.com', 'app.evil.com']);
  assert.equal(hostOf('not a url'), null);
});

test('CoinGecko primary contract: chain priority, EVM lowercase, unsupported -> null', () => {
  assert.deepEqual(primaryContract({ ethereum: '0xABC0000000000000000000000000000000000001', solana: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' }).chain, 'solana');
  assert.equal(primaryContract({ 'binance-smart-chain': '0xABC0000000000000000000000000000000000001' }).address, '0xabc0000000000000000000000000000000000001');
  assert.equal(primaryContract({ dogechain: '0x1' }), null);
  assert.equal(normaliseMarket({ id: 'bonk', symbol: 'bonk', current_price: '0.00001' }).symbol, 'BONK');
});

test('EIP-55 checksum (spec vectors)', () => {
  for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB']) assert.equal(checksum(a.toLowerCase()), a);
});

test('formatting: subscript zeros, compact USD, sparkline', () => {
  assert.equal(price(0.000003464), '$0.0₅3464');
  assert.equal(price(0.08687), '$0.08687');
  assert.equal(usd(304887553), '$304.89M');
  assert.match(spark([1, 2, 3, 2, 4]), /<svg[^>]+class="spark up/);
  assert.equal(spark([1]), '');
});

const tok = (o) => ({ sources: ['coingecko'], cats: [], links: [], ...o });
test('rankings: suspicious caps unranked, gainers filtered, token page SEO', () => {
  const now = new Date().toISOString();
  const tokens = [
    tok({ id: 'solana:A1', chain: 'solana', address: 'A1', path: 'token/solana/A1/', cg: 'aaa', name: 'Alpha', symbol: 'AAA', mcap: 5e8, vol24: 2e7, liq: 3e6, ch24h: 12, priceUsd: 0.5 }),
    tok({ id: 'base:0xbad', chain: 'base', address: '0xbad', path: 'token/base/0xbad/', cg: 'bad', name: 'Bad', symbol: 'BAD', mcap: 9e10, vol24: 7000, liq: 12000, ch24h: 900 }),
    tok({ id: 'solana:N1', chain: 'solana', address: 'N1', path: 'token/solana/N1/', sources: ['dex', 'dexscreener'], name: 'New', symbol: 'NEW', mcap: 2e6, vol24: 3e5, liq: 6e4, ch24h: 5000, createdAt: now }),
  ];
  const d = buildData(tokens, { built: now, trending: [], boosted: [] });
  assert.deepEqual(d.ranked.map((t) => t.symbol), ['AAA', 'NEW']);
  assert.equal(tokens[1].suspicious, true);
  assert.deepEqual(d.gainers.map((t) => t.symbol), ['AAA'], 'launch-day DEX token excluded from gainers');
  assert.equal(indexable(tokens[1]), false);
  const html = tokenPage({ site: 'https://memecoin.markets/', built: now }, tokens[0], { scan: null, related: [], ctx: { ranked: 2 } });
  assert.match(html, /<title>Alpha \(AAA\) Price, Chart &amp; Safety Scan/);
  assert.match(html, /<link rel="canonical" href="https:\/\/memecoin.markets\/token\/solana\/A1\/">/);
  assert.match(html, /"@type":"FinancialProduct"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /<meta name="robots" content="index,follow/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/guides\/uk-memecoin-tax\/"/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld['@graph'].length, 4); assert.equal(ld['@graph'][3]['@type'], 'FAQPage');
});
