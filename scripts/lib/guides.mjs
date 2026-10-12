// Long-tail guides. Data-backed ones are regenerated every build from the same snapshot as the rankings.
import { table, esc, usd, dateLong, num, chainName } from './render.mjs';

const PUBLISHED = '2026-10-12';
const top = (d, f, n = 15) => d.ranked.filter(f).slice(0, n);
const verdictCount = (rows) => rows.reduce((a, t) => ((a[t.scan?.verdict || 'unscanned'] = (a[t.scan?.verdict || 'unscanned'] || 0) + 1), a), {});

function chainGuide(chain, extra) {
  return {
    slug: `best-${chain}-memecoins`,
    title: (d) => `Best ${chainName(chain)} memecoins (${dateLong(d.built).replace(/^\d+ /, '')}): biggest by market cap, liquidity and safety`,
    description: (d) => `The largest ${chainName(chain)} memecoins right now ranked by market cap, with DEX liquidity, 24h volume and a safety scan for each. Updated ${dateLong(d.built)}. Data, not advice.`,
    body: (d, R) => {
      const rows = top(d, (t) => t.chain === chain && t.mcap, 20);
      const liquid = [...rows].sort((a, b) => (b.liq || 0) - (a.liq || 0)).slice(0, 5);
      const vc = verdictCount(rows);
      return `<p>"Best" here means <b>largest and most liquid</b>, not "most likely to go up". This list ranks ${chainName(chain)} memecoins by market cap using CoinGecko's public data, then shows on-chain DEX liquidity from DexScreener and the latest safety scan. It is rebuilt automatically every 30 minutes; last update ${esc(dateLong(d.built))}.</p>
${extra || ''}
<h2>Top ${rows.length} ${chainName(chain)} memecoins by market cap</h2>
${table(rows, R, { cols: ['rank', 'name', 'price', 'ch24h', 'ch7d', 'mcap', 'vol24', 'liq'] })}
<h2>Deepest liquidity</h2><p>Liquidity decides how much you can sell without moving the price. The five deepest in this list: ${liquid.map((t) => `<a href="${R}${t.path}">${esc(t.symbol)}</a> (${usd(t.liq)})`).join(', ')}.</p>
<h2>Safety scan results in this list</h2><p>${Object.entries(vc).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ')}. CLEAR means every hard check (mint/freeze authority or honeypot/tax, holder concentration, liquidity, sell route) was measured and passed. FAIL means at least one measured hard fail — often a large-cap token simply has a centralised mint or freeze authority, which is still a real risk.</p>
<h2>How to use this list</h2><ol><li>Open the token page and check the <b>pools</b> table: one tiny pool is a red flag even for a big market cap.</li><li>Run the <b>live scan</b> on the token page before trading; scores change when liquidity is pulled or authorities change.</li><li>Keep a record of every trade for UK tax — see the <a href="${R}guides/uk-memecoin-tax/">UK memecoin tax guide</a>.</li></ol>
<p>See the full <a href="${R}chain/${chain}/">${chainName(chain)} memecoin rankings</a>, <a href="${R}new/">new pairs</a> and <a href="${R}trending/">trending</a>.</p>`;
    },
  };
}

export const GUIDES = [
  chainGuide('solana', `<p>Solana became the main memecoin chain because launches are cheap (pump.fun, LetsBonk.fun) and trades settle in under a second. That also means thousands of new tokens a day, most of which never reach a real market — which is why this list starts from market cap and liquidity rather than social buzz.</p>`),
  chainGuide('base', `<p>Base memecoins trade mostly on Uniswap and Aerodrome. Because Base is an EVM chain, the main extra risks are contract-level: hidden owners, blacklist functions, adjustable taxes and honeypots, which the scan checks with GoPlus, honeypot.is and an on-chain buy/sell simulation.</p>`),
  chainGuide('ethereum', `<p>Ethereum hosts the oldest large memecoins. Gas costs make micro-cap launches rarer than on Solana, but contract risks (taxes, blacklists, proxy upgrades) still apply.</p>`),
  chainGuide('bsc', `<p>BNB Chain memecoins (including Four.meme launches) trade mostly on PancakeSwap. Fee-on-transfer taxes are common, so check the tax line in each scan.</p>`),
  {
    slug: 'uk-memecoin-tax',
    title: () => 'UK memecoin tax: how Capital Gains Tax works on memecoins (2026/27)',
    description: () => 'How HMRC taxes memecoins: disposals, the same-day and 30-day rules, Section 104 pools, the £3,000 allowance, 18%/24% rates, rug pulls and negligible value claims — with a free calculator.',
    body: (d, R) => `<p class="note">General information for UK residents, not tax advice. Rules are from HMRC's <a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual" rel="noopener">Cryptoassets Manual</a> and <a href="https://www.gov.uk/capital-gains-tax/rates" rel="noopener">GOV.UK CGT rates</a>; check them for your year.</p>
<h2>Are memecoins taxed in the UK?</h2><p>Yes. HMRC treats memecoins like other exchange tokens: for most individuals, profits are subject to <b>Capital Gains Tax (CGT)</b>. If your activity is frequent and organised enough to count as a trade, Income Tax can apply instead (HMRC sets a high bar for this — see <a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto20250" rel="noopener">CRYPTO20250</a>).</p>
<h2>What counts as a disposal</h2><ul><li>Selling a memecoin for pounds.</li><li><b>Swapping one token for another</b> — e.g. BONK → SOL, or SOL → a new pump.fun token. Each swap is a disposal of what you gave up (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22100" rel="noopener">CRYPTO22100</a>).</li><li>Using tokens to pay for something, or giving them away (except to a spouse or civil partner).</li></ul><p>Moving tokens between your own wallets is not a disposal, but network fees paid in tokens can be (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22280" rel="noopener">CRYPTO22280</a>).</p>
<h2>How the gain is worked out: matching rules</h2><p>Each memecoin is a separate asset. When you dispose of some, HMRC matches the tokens in this order (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22200" rel="noopener">CRYPTO22200</a>):</p><ol><li><b>Same day</b> — tokens bought the same day.</li><li><b>Next 30 days</b> — tokens bought in the 30 days <i>after</i> the sale (the "bed and breakfast" rule). Selling a memecoin at a loss and buying it back within 30 days does not crystallise the loss you expected.</li><li><b>Section 104 pool</b> — everything else, at the average cost of all earlier purchases.</li></ol><p>All values must be in sterling at the time of each trade, including the GBP value of SOL/ETH used to buy.</p>
<h2>Allowance and rates (2026/27)</h2><p>The annual exempt amount is <b>£3,000</b>. Gains above it are taxed at <b>18%</b> within the basic rate band and <b>24%</b> above it (GOV.UK). Allowable costs include exchange and network fees directly linked to buying and selling (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22150" rel="noopener">CRYPTO22150</a>).</p>
<h2>Rug pulls, honeypots and dead tokens</h2><p>A token that goes to zero is not automatically a loss for tax. If it has become worthless you can make a <b>negligible value claim</b>, treating it as sold and reacquired at nil (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22500" rel="noopener">CRYPTO22500</a>). Being scammed or losing tokens to theft is treated differently (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22450" rel="noopener">CRYPTO22450</a>). A honeypot token you can never sell is a typical negligible value case — keep the scan result and transaction links as evidence.</p>
<h2>Airdrops and free tokens</h2><p>Airdropped memecoins received without doing anything in return are generally not income, but they have a cost of nil for CGT when you later sell them (<a href="https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22350" rel="noopener">CRYPTO22350</a>).</p>
<h2>Reporting</h2><p>You normally report through Self Assessment if your gains exceed the allowance, or if your total disposal proceeds exceed £50,000 even when gains are lower. UK crypto platforms collect user and transaction data under the OECD Cryptoasset Reporting Framework from 1 January 2026, so assume HMRC will see centralised-exchange activity.</p>
<h2>Worked example</h2><p>You buy 10m BONK for £300, then another 10m for £100 (pool: 20m at £400). Two months later you sell 15m for £600. Cost from the pool = £400 × 15/20 = £300, so the gain is £300; 5m BONK remain in the pool at £100. The free <a href="${R}tools/#pnl">PnL / UK CGT calculator</a> does this matching (same-day, 30-day, Section 104) for a CSV of trades and exports a rotki-compatible file.</p>
<h2>Keep records</h2><p>For each trade keep date/time, token, amount, GBP value, fees and wallet or exchange. On-chain trades can be rebuilt from your wallet address; export them before tokens and pools disappear.</p>`,
  },
  {
    slug: 'how-to-spot-a-memecoin-rug-pull',
    title: () => 'How to spot a memecoin rug pull: 9 checks before you buy',
    description: () => 'A practical rug-pull checklist for Solana and EVM memecoins: mint and freeze authority, LP lock, holder concentration, honeypots, taxes, dev wallets and fake websites — and how to check each for free.',
    body: (d, R) => {
      const fails = d.ranked.filter((t) => t.scan?.verdict === 'FAIL').length; const scanned = d.ranked.filter((t) => t.scan).length;
      return `<p>Of the ${num(scanned)} memecoins scanned on this site in the last day, <b>${num(fails)}</b> had at least one measured hard fail. Most rugs are visible in public data before they happen. Here is what to check, in order, and which free source answers it. Every check below runs automatically on each <a href="${R}">token page</a>.</p>
<ol class="steps">
<li><h3>Mint authority (Solana) / mint function (EVM)</h3><p>If someone can still mint, they can print unlimited supply and dump it. On Solana the mint account says it directly; read it from any RPC. On EVM, look for a mint function and whether ownership is renounced.</p></li>
<li><h3>Freeze authority (Solana)</h3><p>A freeze authority can freeze your token account so you cannot sell. Legitimate stablecoins keep one; a memecoin has no reason to.</p></li>
<li><h3>Token-2022 extensions</h3><p>Permanent delegate (can move anyone's tokens), transfer hooks (custom code on every transfer) and transfer fees are all visible on the mint. The scanner decodes them byte by byte.</p></li>
<li><h3>Liquidity and LP lock</h3><p>Check total pool liquidity and whether LP tokens are burned or locked. Unlocked LP can be pulled in one transaction. pump.fun tokens migrate to pools where LP is burned automatically.</p></li>
<li><h3>Holder concentration</h3><p>If the top 10 wallets (excluding pools) hold more than ~50%, a few people decide the price. Bundled launches hide this across many fresh wallets — look at holder count growth too.</p></li>
<li><h3>Can you actually sell? (honeypots)</h3><p>A honeypot lets you buy but blocks or taxes selling. On EVM, simulate a buy and sell: this site runs honeypot.is, GoPlus and an independent on-chain simulation through a forked honeyCheck contract. On Solana, ask Jupiter for a sell route. Read <a href="${R}guides/what-is-a-honeypot-token/">what a honeypot token is</a>.</p></li>
<li><h3>Taxes and owner switches (EVM)</h3><p>Look for adjustable taxes, blacklists, pausable transfers and hidden owners. A 0% tax today can become 99% tomorrow if the owner can change it.</p></li>
<li><h3>Developer wallet history</h3><p>Serial launchers who create dozens of tokens that never graduate are a pattern. Jupiter's audit data shows how many tokens a dev created and how many migrated.</p></li>
<li><h3>Website and socials</h3><p>Check the links against a phishing list before connecting a wallet. This site checks every token's links against the Polkadot/Blockchains phishing deny-list (${num(d.phishingSize || 0)} domains).</p></li>
</ol>
<p>Use the <a href="${R}tools/#scan">token safety scanner</a> for any address, or the <a href="${R}tools/#checklist">launch checklist</a> if you are launching a token yourself.</p>`;
    },
  },
  {
    slug: 'what-is-a-honeypot-token',
    title: () => 'What is a honeypot token? How to check if you can sell a memecoin',
    description: () => 'Honeypot tokens let you buy but not sell. How they work on Ethereum, Base and BNB Chain, why charts can look healthy, and how to simulate a sell for free before buying.',
    body: (d, R) => `<p>A <b>honeypot</b> is a token whose contract lets anyone buy but stops most holders from selling — through a blacklist, a hidden "only owner can sell" rule, a 99% sell tax, or a transfer function that fails for everyone except whitelisted wallets. The chart keeps going up because only buys succeed.</p>
<h2>How to detect one without risking money</h2><p>Simulate the trade. A simulation runs buy → approve → sell against the live chain state without sending a transaction. Each EVM token page here runs three independent simulations:</p><ul><li><b>honeypot.is</b> — fork-based simulation with tax estimates.</li><li><b>GoPlus</b> — static and dynamic contract analysis (honeypot flag, taxes, blacklist, owner powers).</li><li><b>On-chain eth_call</b> — the open-source honeyCheck contract (MIT, forked to <a href="https://github.com/Blockchains/web3-defi-honeypot-and-slippage-checker">Blockchains/web3-defi-honeypot-and-slippage-checker</a>) buys with 0.5 ETH/BNB through a v2 router and sells straight back in a single read-only call. A round-trip loss of about 0.6% is normal (two pool fees); anything much higher is a tax.</li></ul>
<h2>Limits</h2><p>Simulations can be fooled by contracts that behave differently for simulators, by time-based switches, or by owners who change rules after you buy. Treat a pass as "not obviously a honeypot right now", not as a guarantee. Solana SPL tokens cannot hide sell logic the same way, but freeze authority, Token-2022 transfer hooks and permanent delegates create equivalent risks.</p>
<p>Scan any token in the <a href="${R}tools/#scan">safety scanner</a>.</p>`,
  },
  {
    slug: 'new-solana-memecoins-today',
    title: (d) => `New Solana memecoins today (${dateLong(d.built)}): fresh pairs with safety flags`,
    description: (d) => `Newest Solana memecoin pairs with real liquidity, age, 24h volume and quick safety flags. Refreshed every 30 minutes. Updated ${dateLong(d.built)}. Most new tokens fail — check before buying.`,
    body: (d, R) => {
      const rows = d.fresh.filter((t) => t.chain === 'solana').slice(0, 30);
      return `<p>These are the newest Solana tokens that already have a DEX pool with at least $1,000 of liquidity, from GeckoTerminal's new-pool feed and DexScreener's latest profiles. Hundreds of tokens launch every hour on pump.fun and similar launchpads; this filter removes most of the noise, but <b>new tokens are the riskiest category there is</b>.</p>
${rows.length ? table(rows, R, { cols: ['rank', 'name', 'age', 'price', 'ch1h', 'ch24h', 'liq', 'vol24', 'txns'] }) : '<p class="muted">No new pairs passed the liquidity filter in this refresh.</p>'}
<h2>What to check on a brand-new token</h2><ul><li>Mint and freeze authority revoked.</li><li>Liquidity well above your trade size, LP burned or locked.</li><li>Top-10 holders (excluding the pool) below ~50%.</li><li>A sell route exists (Jupiter).</li></ul><p>See all chains on the <a href="${R}new/">new pairs page</a> or read <a href="${R}guides/how-to-spot-a-memecoin-rug-pull/">how to spot a rug pull</a>.</p>`;
    },
  },
  {
    slug: 'memecoin-market-cap-vs-liquidity',
    title: () => 'Memecoin market cap vs FDV vs liquidity: what the numbers really mean',
    description: () => 'Why a memecoin with a $50M market cap can have $200K of liquidity, how FDV differs from market cap, and which number tells you whether you can actually sell.',
    body: (d, R) => {
      const ratio = d.ranked.filter((t) => t.mcap > 1e7 && t.liq).map((t) => ({ t, r: t.mcap / t.liq })).sort((a, b) => b.r - a.r).slice(0, 5);
      return `<h2>Market cap</h2><p>Price × circulating supply. It is a headline number, not money that exists anywhere: if everyone tried to sell, the price would collapse long before that value was paid out.</p><h2>FDV (fully diluted valuation)</h2><p>Price × total or maximum supply. For most memecoins FDV ≈ market cap because the whole supply is circulating; a big gap means locked or unreleased tokens that could be sold later.</p><h2>Liquidity</h2><p>The value sitting in DEX pools that you trade against. It decides price impact: selling $1,000 into a $10,000 pool moves the price roughly 10%. On centralised exchanges, order-book depth plays the same role.</p>
<h2>Market cap to liquidity ratio</h2><p>A high ratio means a thin market relative to its valuation. Among memecoins over $10M market cap on this site right now, the thinnest are: ${ratio.map(({ t, r }) => `<a href="${R}${t.path}">${esc(t.symbol)}</a> (${num(r)}×)`).join(', ')}. Some of these trade mostly on centralised exchanges, which DEX liquidity does not capture.</p><p>Sort any ranking by <a href="${R}liquidity/">liquidity</a> to compare.</p>`;
    },
  },
  {
    slug: 'pump-fun-memecoins',
    title: () => 'Pump.fun memecoins: the biggest tokens that graduated, ranked',
    description: () => 'The largest memecoins launched on pump.fun by market cap and liquidity, how the bonding curve and migration work, and what risks remain after graduation.',
    body: (d, R) => {
      const rows = d.ranked.filter((t) => (t.cats || []).includes('pump-fun') || /pump$/.test(t.address || '')).slice(0, 20);
      return `<p>pump.fun lets anyone launch a Solana token on a bonding curve; when the curve fills, the token "graduates" to a regular AMM pool with the liquidity burned. Most launches never graduate. These are the largest pump.fun-ecosystem tokens tracked here (CoinGecko category plus mints ending in <code>pump</code>).</p>
${rows.length ? table(rows, R, { cols: ['rank', 'name', 'price', 'ch24h', 'ch7d', 'mcap', 'vol24', 'liq'] }) : ''}
<h2>Risks after graduation</h2><p>Burned LP removes the classic liquidity pull, and pump.fun mints have no mint or freeze authority. The remaining risks are holder concentration (bundled launches), dev dumping, and thin liquidity. Check holders and the sell route on each token page. See the <a href="${R}category/pump-fun/">Pump.fun category</a>.</p>`;
    },
  },
  {
    slug: 'dog-vs-cat-vs-frog-memecoins',
    title: () => 'Dog vs cat vs frog memecoins: which meme category is biggest?',
    description: () => 'Total market cap, 24h volume and the leaders of the dog-, cat- and frog-themed memecoin categories, updated automatically from CoinGecko category data.',
    body: (d, R) => {
      const cats = [['dog-themed-coins', 'Dog'], ['cat-themed-coins', 'Cat'], ['frog-themed-coins', 'Frog'], ['ai-meme-coins', 'AI meme']];
      const rows = cats.map(([s, n]) => { const ts = d.ranked.filter((t) => (t.cats || []).includes(s)); return { s, n, count: ts.length, mcap: ts.reduce((a, t) => a + (t.mcap || 0), 0), vol: ts.reduce((a, t) => a + (t.vol24 || 0), 0), lead: ts.slice(0, 3) }; });
      return `<div class="tw"><table class="rt"><thead><tr><th>Category</th><th class="num">Tokens</th><th class="num">Market cap</th><th class="num">Volume 24h</th><th>Leaders</th></tr></thead><tbody>${rows.map((r) => `<tr><td><a href="${R}category/${r.s}/">${esc(r.n)}</a></td><td class="num">${num(r.count)}</td><td class="num">${usd(r.mcap)}</td><td class="num">${usd(r.vol)}</td><td>${r.lead.map((t) => `<a href="${R}${t.path}">${esc(t.symbol)}</a>`).join(', ')}</td></tr>`).join('')}</tbody></table></div><p>Category membership comes from CoinGecko. Totals include only tokens tracked on this site. Updated ${esc(dateLong(d.built))}.</p>`;
    },
  },
];

export function guidePage(g, d) { return { slug: g.slug, title: g.title(d), description: g.description(d), body: (R) => g.body(d, R), published: PUBLISHED }; }
