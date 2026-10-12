// grammY integration without network: feed a real-shaped Update, capture outgoing API calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../examples/telegram-bot/bot.js';

const botInfo = { id: 1, is_bot: true, first_name: 'mm', username: 'mm_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };
const fakeScan = async ({ address }) => ({ verdict: 'FAIL', policy: 'policy-v1.1', verdictNote: 'x', token: { symbol: 'USDC' }, market: { liquidityUsd: 1000, dex: 'orca' }, checks: [{ status: 'fail', label: 'Mint authority revoked', value: 'auth' }], address });

test('/scan command replies with formatted scan via grammY', async () => {
  const sent = [];
  const bot = createBot('123:TEST', { botInfo, scan: fakeScan });
  bot.api.config.use(async (prev, method, payload) => { sent.push({ method, payload }); return { ok: true, result: { message_id: 1, date: 0, chat: { id: 7, type: 'private' } } }; });
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, date: 0, chat: { id: 7, type: 'private' }, from: { id: 7, is_bot: false, first_name: 'u' }, text: '/scan EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', entities: [{ type: 'bot_command', offset: 0, length: 5 }] } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'sendMessage');
  assert.match(sent[0].payload.text, /USDC — FAIL/);
  assert.match(sent[0].payload.text, /❌ Mint authority revoked/);
});
