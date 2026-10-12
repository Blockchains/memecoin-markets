// Telegram bot as a library: grammY (MIT, grammyjs/grammY) + the memecoin-markets SDK.
// Read-only commands; it never holds keys or trades. Run: TELEGRAM_BOT_TOKEN=... node examples/telegram-bot/bot.js
import { Bot } from 'grammy';
import { scanToken, radar } from '../../src/index.js';

const ICON = { pass: '✅', warn: '⚠️', fail: '❌', unknown: '❔' };

export function formatScan(s) {
  const head = `${s.token?.symbol || '?'} — ${s.verdict} (${s.policy})`;
  const lines = s.checks.map((c) => `${ICON[c.status]} ${c.label}: ${c.value ?? '—'}`);
  const m = s.market ? `Liq $${Math.round(s.market.liquidityUsd || 0).toLocaleString('en-GB')} · ${s.market.dex}` : 'No pool found';
  return [head, m, ...lines, s.verdictNote, 'Not financial advice.'].join('\n');
}

export function formatRadar(r, n = 8) {
  return [`Newest ${r.chain} pairs:`, ...r.rows.slice(0, n).map((x) => `${x.symbol || '?'} · ${x.ageMin ?? '?'}m · $${Math.round(x.liquidityUsd || 0)} liq${x.flags.length ? ' · ' + x.flags.join(', ') : ''}\n${x.address}`)].join('\n');
}

/** @param {string} token @param {{scan?:typeof scanToken, radar?:typeof radar, botInfo?:any}} [deps] */
export function createBot(token, deps = {}) {
  const scan = deps.scan || scanToken;
  const rad = deps.radar || radar;
  const bot = new Bot(token, deps.botInfo ? { botInfo: deps.botInfo } : undefined);
  bot.command('start', (ctx) => ctx.reply('memecoin.markets safety bot. /scan <mint or 0x address> · /new — newest Solana pairs. Read-only, not advice.'));
  bot.command('scan', async (ctx) => {
    const addr = (ctx.match || '').trim();
    if (!addr) return ctx.reply('Usage: /scan <Solana mint or 0x token address>');
    try { await ctx.reply(formatScan(await scan({ address: addr }))); } catch (e) { await ctx.reply(`Scan failed: ${e.message}`); }
  });
  bot.command('new', async (ctx) => ctx.reply(formatRadar(await rad({ chain: 'solana', limit: 8 }))));
  return bot;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) { console.error('Set TELEGRAM_BOT_TOKEN'); process.exit(1); }
  createBot(t).start();
}
