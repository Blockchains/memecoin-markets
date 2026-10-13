// Browser e2e against the built site (local) or the live Pages URL (E2E_URL). Real upstream data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serve } from '../scripts/serve.mjs';

let srv, browser, base;
before(async () => {
  if (process.env.E2E_URL) base = process.env.E2E_URL.replace(/\/?$/, '/');
  else { srv = await serve('_site', 0, '/memecoin-markets/'); base = `http://127.0.0.1:${srv.address().port}/memecoin-markets/`; } // same sub-path as Pages
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); srv?.close(); });

test('rankings home: table, links to token pages, SEO head, legacy #scan redirect', async () => {
  const page = await browser.newPage();
  const res = await page.goto(base);
  assert.equal(res.status(), 200);
  const rows = await page.$$('#rank-table tbody tr');
  assert.ok(rows.length >= 20, `rows ${rows.length}`);
  const href = await page.getAttribute('#rank-table tbody tr th.nm a', 'href');
  assert.match(href, /^(token|coin)\//);
  assert.ok(await page.$('link[rel=canonical]'));
  assert.match(await page.textContent('script[type="application/ld+json"]'), /"WebSite"/);
  await page.close();
  const p2 = await browser.newPage(); // legacy toolkit deep links (Build paste, old shares) land on /tools/
  await p2.goto(`${base}#scan?address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`);
  await p2.waitForURL(/tools\/#scan/, { timeout: 10000 });
  await p2.close();
});

test('token pages return 200 with unique title, canonical, JSON-LD; BONK live scan passes authorities', async () => {
  const page = await browser.newPage();
  const sm = await (await page.request.get(`${base}sitemap.xml`)).text();
  const tokenUrls = [...sm.matchAll(/<loc>([^<]+\/token\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(tokenUrls.length >= 50, `sitemap token urls ${tokenUrls.length}`);
  const titles = new Set();
  for (const u of tokenUrls.slice(0, 5)) {
    const local = base + new URL(u).pathname.replace(/^\/(memecoin-markets\/)?/, '');
    const r = await page.goto(local); assert.equal(r.status(), 200, local);
    titles.add(await page.title());
    assert.equal(await page.getAttribute('link[rel=canonical]', 'href'), u);
    assert.match(await page.textContent('script[type="application/ld+json"]'), /FinancialProduct/);
  }
  assert.equal(titles.size, 5, 'titles unique');
  // Live BONK scan: upstream RPCs/GoPlus can stall in CI — reload+retry before failing.
  let verdictOk = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${base}token/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#live-scan', { timeout: 15000 });
    await page.click('#live-scan'); // joins the auto-run if it already started (no double scan)
    try {
      await page.waitForSelector('[data-live-verdict]', { timeout: 90000 });
      verdictOk = true;
      break;
    } catch (err) {
      const errText = await page.textContent('#live-scan-out').catch(() => '');
      if (attempt === 3) throw err;
      console.log(`live scan attempt ${attempt} timed out (${errText.slice(0, 120)}); retrying`);
    }
  }
  assert.ok(verdictOk, 'live scan produced a verdict');
  assert.match(await page.textContent('[data-live-check="mint_authority"]'), /PASS/);
  assert.match(await page.textContent('[data-live-check="freeze_authority"]'), /PASS/);
  await page.close();
});

test('watchlist persists, compare and search work', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(base);
  const id = await page.getAttribute('#rank-table tbody tr [data-star]', 'data-star');
  await page.click('#rank-table tbody tr [data-star]');
  await page.goto(`${base}watchlist/`);
  await page.waitForSelector(`#wl-out tr[data-id="${id}"]`, { timeout: 15000 });
  await page.goto(`${base}compare/?ids=${encodeURIComponent(id)}`);
  await page.waitForSelector('#cmp-out table', { timeout: 15000 });
  await page.goto(`${base}search/?q=bonk`);
  await page.waitForSelector('#search-out li a', { timeout: 15000 });
  await ctx.close();
});

test('toolkit: EVM honeypot checklist (PEPE) + radar snapshot', async () => {
  const page = await browser.newPage();
  await page.goto(`${base}tools/#checklist?address=0x6982508145454Ce325dDbE47a25d4ec3d2311933`);
  await page.waitForSelector('[data-item="honeypot"]', { timeout: 60000 });
  assert.match(await page.textContent('[data-item="honeypot"]'), /DONE/);
  await page.goto(`${base}tools/#radar`);
  await page.waitForSelector('#radar-table tbody tr', { timeout: 30000 });
  await page.close();
});

test('v0.3 repo-fork features: pump.fun board, sell depth, token lists, token-page depth card, JSON', async () => {
  const page = await browser.newPage();
  let r = await page.goto(`${base}pumpfun/`); assert.equal(r.status(), 200);
  assert.ok((await page.$$('#pf-curve tbody tr')).length >= 5, 'bonding-curve rows');
  assert.match(await page.textContent('#pf-curve'), /\d+\.\d%|Graduated/);
  r = await page.goto(`${base}sell-depth/`); assert.equal(r.status(), 200);
  assert.ok((await page.$$('#sell-depth tbody tr')).length >= 5, 'sell-depth rows');
  r = await page.goto(`${base}token-lists/`); assert.equal(r.status(), 200);
  assert.ok((await page.$$('#token-lists tbody tr')).length >= 50, 'token-list rows');
  await page.goto(`${base}token/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/`, { waitUntil: 'domcontentloaded' });
  assert.match(await page.textContent('#depth'), /Raydium pools/);
  const j = await (await page.request.get(`${base}v1/token/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263.json`)).json();
  assert.ok(j.token.raydium?.count > 0, 'raydium in token json');
  const pf = await (await page.request.get(`${base}v1/pumpfun.json`)).json();
  assert.ok(pf.curve.some((x) => x.curve && typeof x.curve.progressPct === 'number'), 'decoded curves');
  await page.close();
});

test('offline core: rankings, a visited token page, watchlist and UK tax calculator work offline', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready);
  const tok = await page.getAttribute('#rank-table tbody tr th.nm a', 'href');
  await page.goto(base + tok); await page.waitForLoadState('load');
  await page.goto(`${base}tools/`); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.goto(base); assert.ok((await page.$$('#rank-table tbody tr')).length > 0);
  assert.equal(await page.textContent('#net'), 'OFFLINE');
  await page.goto(base + tok); assert.ok(await page.$('article.token h1'));
  await page.goto(`${base}watchlist/`); assert.ok(await page.$('#wl-out'));
  await page.goto(`${base}tools/#pnl`); await page.reload();
  await page.click('#pnl-sample');
  assert.match(await page.textContent('[data-year="2024/25"] .net'), /£3,930\.00/);
  await ctx.setOffline(false); await ctx.close();
});

test('token page: Buy/Sell replace Compare with identical box, open correct swap URLs', async () => {
  const page = await browser.newPage();
  await page.goto(`${base}token/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/`);
  assert.equal(await page.$('.ta a[href*="compare/"]'), null, 'no Compare CTA');
  const box = async (sel) => page.$eval(sel, (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return [Math.round(r.height), s.fontSize, s.padding, s.borderRadius, s.backgroundColor, s.className]; });
  const b = await box('.ta [data-swap=buy]'), s = await box('.ta [data-swap=sell]');
  assert.deepEqual(b.slice(0, 5), s.slice(0, 5));
  const ref = await page.evaluate(() => { const a = document.createElement('a'); a.className = 'btn ghost'; a.textContent = 'Compare'; document.querySelector('.ta').append(a); const st = getComputedStyle(a); const r = a.getBoundingClientRect(); const o = [Math.round(r.height), st.fontSize, st.padding, st.borderRadius, st.backgroundColor]; a.remove(); return o; });
  assert.deepEqual(b.slice(0, 5), ref, 'same box as old Compare');
  assert.match(await page.getAttribute('[data-swap=buy]', 'href'), /^https:\/\/jup\.ag\/swap\?sell=So11111111111111111111111111111111111111112&buy=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263$/);
  assert.match(await page.getAttribute('[data-swap=sell]', 'href'), /^https:\/\/jup\.ag\/swap\?sell=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&buy=So1/);
  assert.ok(await page.$('link[rel=preconnect][href="https://jup.ag"]'));
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('[data-swap=buy]')]);
  assert.match(popup.url(), /jup\.ag/); await popup.close();
  await page.goto(`${base}token/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933/`);
  assert.match(await page.getAttribute('[data-swap=buy]', 'href'), /app\.uniswap\.org\/swap\?chain=mainnet&inputCurrency=NATIVE&outputCurrency=0x6982/i);
  await page.close();
});
