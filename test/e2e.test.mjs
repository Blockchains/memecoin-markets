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

test('scanner deep link scans BONK live in the browser', async () => {
  const page = await browser.newPage();
  await page.goto(`${base}#scan?address=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`);
  await page.waitForSelector('[data-verdict]', { timeout: 60000 });
  const v = await page.getAttribute('[data-verdict]', 'data-verdict');
  assert.ok(['CLEAR', 'DESK_PASS'].includes(v), v);
  assert.match(await page.textContent('[data-check="mint_authority"]'), /PASS/);
  assert.match(await page.textContent('[data-check="freeze_authority"]'), /PASS/);
  await page.close();
});

test('EVM honeypot path + launch checklist for PEPE', async () => {
  const page = await browser.newPage();
  await page.goto(`${base}#checklist?address=0x6982508145454Ce325dDbE47a25d4ec3d2311933`);
  await page.waitForSelector('[data-item="honeypot"]', { timeout: 60000 });
  assert.match(await page.textContent('[data-item="honeypot"]'), /DONE/);
  assert.match(await page.textContent('[data-item="tax"]'), /DONE/);
  await page.close();
});

test('radar renders the Actions snapshot, PnL works, and the app works offline', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}#radar`);
  await page.waitForSelector('#radar-table tbody tr', { timeout: 30000 });
  assert.ok((await page.$$('#radar-table tbody tr')).length > 0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // ensure SW controls the page
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.goto(`${base}#pnl`);
  await page.reload();
  assert.equal(await page.textContent('#net'), 'OFFLINE');
  await page.click('#pnl-sample');
  assert.match(await page.textContent('[data-year="2024/25"] .net'), /£3,930\.00/);
  await page.goto(`${base}#radar`);
  await page.waitForSelector('#radar-table tbody tr', { timeout: 15000 });
  await ctx.setOffline(false);
  await ctx.close();
});
