// Browser e2e against the built site (local) or the live Pages URL (E2E_URL). Real upstream data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serve } from '../scripts/serve.mjs';

let srv, browser, base;
before(async () => {
  if (process.env.E2E_URL) base = process.env.E2E_URL.replace(/\/?$/, '/');
  else { srv = await serve('_site'); base = `http://127.0.0.1:${srv.address().port}/`; }
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
  await page.goto(`${base}token/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/`);
  await page.click('#live-scan');
  await page.waitForSelector('[data-live-verdict]', { timeout: 60000 });
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
