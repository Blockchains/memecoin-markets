// Build the Pages site: static app + SDK as ESM under /lib + live JSON snapshots under /v1.
// Run by GitHub Actions on push and on a schedule. Snapshots are real upstream data at build time.
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { radar, scanToken, POLICY, LAUNCH_ITEMS } from '../src/index.js';
import { latestBoosts } from '../src/sources/dexscreener.js';

const OUT = process.env.OUT || '_site';
const BASE = 'https://blockchains.github.io/memecoin-markets';
const OFFLINE = process.env.OFFLINE === '1';
const pkg = JSON.parse(readFileSync('package.json'));
const now = new Date().toISOString();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/v1`, { recursive: true });
cpSync('web', OUT, { recursive: true });
cpSync('src', `${OUT}/lib`, { recursive: true });
for (const f of ['llms.txt', 'blocks.json', 'AGENTS.md']) cpSync(f, `${OUT}/${f}`);
writeFileSync(`${OUT}/sw.js`, readFileSync(`${OUT}/sw.js`, 'utf8').replace('__BUILD__', now.replace(/\D/g, '').slice(0, 14)));
writeFileSync(`${OUT}/.nojekyll`, '');
writeFileSync(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
writeFileSync(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/</loc><lastmod>${now.slice(0, 10)}</lastmod></url></urlset>\n`);

const meta = { generated_at: now, version: pkg.version, policy: POLICY.id, built_by: 'Blockchain Lab — https://blockchainlab.com', repo: 'https://github.com/Blockchains/memecoin-markets', disclaimer: 'Evidence, not advice. Each check names its upstream source.' };
const write = (name, data) => writeFileSync(`${OUT}/v1/${name}`, JSON.stringify({ ...meta, ...data }, null, 1));
const errors = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

write('policy.json', { policy: POLICY, launch_checklist: LAUNCH_ITEMS });

const radars = {};
for (const chain of ['solana', 'base']) {
  if (OFFLINE) { radars[chain] = { chain, generatedAt: now, count: 0, rows: [], errors: { offline: 'build ran with OFFLINE=1' } }; }
  else try { radars[chain] = await radar({ chain, limit: 60, rugcheck: chain === 'solana' ? 8 : 0 }); } catch (e) { errors[`radar-${chain}`] = String(e.message); radars[chain] = { chain, generatedAt: now, count: 0, rows: [], errors: { radar: String(e.message) } }; }
  write(`radar-${chain}.json`, radars[chain]);
}

// Full safety scans for what the live desk shows first: latest Solana boosts, then the freshest
// liquid radar rows. This is the feed memecoin.grok.me can use to resolve its UNRESOLVED rows.
const scans = [];
if (!OFFLINE) {
  let boosts = [];
  try { boosts = (await latestBoosts()).filter((b) => b.chain === 'solana').map((b) => b.address); } catch (e) { errors.boosts = String(e.message); }
  const fresh = (radars.solana.rows || []).filter((r) => (r.liquidityUsd ?? 0) >= POLICY.deskLiquidityUsd).map((r) => r.address);
  const targets = [...new Set([...boosts.slice(0, 12), ...fresh.slice(0, 8)])];
  for (const address of targets) {
    try { scans.push(await scanToken({ address, chain: 'solana' })); } catch (e) { errors[`scan:${address}`] = String(e.message); }
    await sleep(400);
  }
}
const slim = (s) => ({ chain: s.chain, address: s.address, verdict: s.verdict, policy: s.policy, token: s.token, market: s.market && { dex: s.market.dex, priceUsd: s.market.priceUsd, liquidityUsd: s.market.liquidityUsd, fdvUsd: s.market.fdvUsd, createdAt: s.market.createdAt, url: s.market.url }, checks: s.checks.map(({ id, status, value, source, hard }) => ({ id, status, value, source, hard: !!hard })), errors: s.errors, scannedAt: s.scannedAt });
write('scans-solana.json', { count: scans.length, by_address: Object.fromEntries(scans.map((s) => [s.address, slim(s)])) });

const endpoints = [
  ['v1/radar-solana.json', 'Newest Solana pools (GeckoTerminal) + DexScreener profiles/boosts, liquidity, age, 5m txns, RugCheck for liquid rows, quick flags'],
  ['v1/radar-base.json', 'Same radar for Base'],
  ['v1/scans-solana.json', 'Full safety scans (mint/freeze, Token-2022, holders, LP, RugCheck, Jupiter sell route) for the latest DexScreener Solana boosts and the freshest liquid pools, keyed by mint'],
  ['v1/policy.json', `Desk policy ${POLICY.id} thresholds and the launch checklist`],
  ['lib/index.js', 'The SDK as a browser ES module: import { scanToken, radar, ukCgt } from this URL'],
  ['llms.txt', 'Agent-readable summary'],
  ['blocks.json', 'Blockchains building-block manifest'],
];
write('index.json', { endpoints: endpoints.map(([path, description]) => ({ path, url: `${BASE}/${path}`, description })), errors });
console.log(JSON.stringify({ out: OUT, radar: Object.fromEntries(Object.entries(radars).map(([k, v]) => [k, v.count])), scans: scans.length, verdicts: scans.reduce((a, s) => ((a[s.verdict] = (a[s.verdict] || 0) + 1), a), {}), errors }, null, 1));
