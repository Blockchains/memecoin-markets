// Token safety scanner. Aggregates free public sources; every check records where it came from.
// Output is evidence, never advice: a CLEAR verdict is not a buy signal.
import { tokenPairs } from './sources/dexscreener.js';
import { rugcheckSummary } from './sources/rugcheck.js';
import { goplusSolana, goplusEvm, EVM_CHAIN_ID } from './sources/goplus.js';
import { honeypotIs } from './sources/honeypot.js';
import { honeySim, HONEY_CHAINS } from './sources/honeysim.js';
import { tokenInfo, sellProbe } from './sources/jupiter.js';
import { getMint } from './sources/solana-rpc.js';

/** Same bars the live memecoin.markets desk prints (policy-v1.1): $150 liq, top10 <= 80 %, mint+freeze clean. */
export const POLICY = Object.freeze({
  id: 'policy-v1.1',
  deskLiquidityUsd: 150,
  maxTop10Pct: 80,
  warnTop10Pct: 50,
  warnLiquidityUsd: 10000,
  maxTaxPct: 10,
  warnTaxPct: 5,
  warnLpLockedPct: 50,
  warnPriceImpactPct: 10,
  probeUsd: 50,
  warnDevMints: 20,
  warnDevBalancePct: 10,
});

export const isSolanaAddress = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || '');
export const isEvmAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || '');
export const SUPPORTED_CHAINS = ['solana', ...Object.keys(EVM_CHAIN_ID)];

const settle = async (p) => { try { return { ok: true, value: await p }; } catch (e) { return { ok: false, error: String(e?.message || e) }; } };

function check(id, label, status, value, source, note) {
  return { id, label, status, value: value ?? null, source, ...(note ? { note } : {}) };
}

/**
 * Scan one token.
 * @param {{address:string, chain?:string, rpc?:string, skip?:string[]}} input
 */
export async function scanToken(input) {
  const address = String(input.address || '').trim();
  const chain = input.chain || (isEvmAddress(address) ? 'ethereum' : isSolanaAddress(address) ? 'solana' : null);
  if (!chain || !SUPPORTED_CHAINS.includes(chain)) throw new Error(`unsupported chain/address: ${chain || address}`);
  if (chain === 'solana' && !isSolanaAddress(address)) throw new Error('not a Solana mint address');
  if (chain !== 'solana' && !isEvmAddress(address)) throw new Error('not an EVM token address');
  const started = Date.now();
  const r = chain === 'solana' ? await scanSolana(address, input) : await scanEvm(chain, address, input);
  const fails = r.checks.filter((c) => c.status === 'fail');
  const unknown = r.checks.filter((c) => c.status === 'unknown' && c.hard);
  const liq = r.market?.liquidityUsd ?? 0;
  const verdict = fails.length ? 'FAIL' : unknown.length ? (liq >= POLICY.deskLiquidityUsd ? 'DESK_PASS' : 'INCOMPLETE') : 'CLEAR';
  return {
    chain, address, policy: POLICY.id, verdict,
    verdictNote: {
      FAIL: 'At least one measured hard fail. Do not treat as tradable.',
      INCOMPLETE: 'Not enough evidence; some hard checks could not be measured.',
      DESK_PASS: 'Meets the desk liquidity bar with no measured hard fail, but some hard checks are unmeasured.',
      CLEAR: 'Every hard check measured and passed. Still not a buy recommendation.',
    }[verdict],
    token: r.token, market: r.market, checks: r.checks,
    sources: r.sources, errors: r.errors, scannedAt: new Date().toISOString(), ms: Date.now() - started,
  };
}

async function scanSolana(mint, input) {
  const [ds, rc, gp, jt, mi] = await Promise.all([
    settle(tokenPairs('solana', [mint])),
    settle(rugcheckSummary(mint)),
    settle(goplusSolana(mint)),
    settle(tokenInfo(mint)),
    settle(getMint(mint, { rpc: input.rpc })),
  ]);
  const errors = {};
  for (const [k, v] of Object.entries({ dexscreener: ds, rugcheck: rc, goplus: gp, jupiter: jt, 'solana-rpc': mi })) if (!v.ok) errors[k] = v.error;
  const pairs = ds.ok ? ds.value.filter((p) => p.base.address === mint || p.quote.address === mint) : [];
  const top = pairs[0] || null;
  const j = jt.ok ? jt.value : null;
  const m = mi.ok && mi.value.isMint ? mi.value : null;
  const g = gp.ok ? gp.value : null;
  const rcv = rc.ok ? rc.value : null;
  const checks = [];
  const hard = (c) => Object.assign(c, { hard: true });

  // Authorities: RPC is authoritative; fall back to GoPlus / Jupiter audit if RPC failed.
  if (m) {
    checks.push(hard(check('mint_authority', 'Mint authority revoked', m.mintAuthority ? 'fail' : 'pass', m.mintAuthority || 'none', 'solana-rpc')));
    checks.push(hard(check('freeze_authority', 'Freeze authority revoked', m.freezeAuthority ? 'fail' : 'pass', m.freezeAuthority || 'none', 'solana-rpc')));
    checks.push(hard(check('permanent_delegate', 'No permanent delegate (Token-2022)', m.permanentDelegate ? 'fail' : 'pass', m.permanentDelegate || 'none', 'solana-rpc', 'A permanent delegate can move or burn any holder balance.')));
    checks.push(hard(check('transfer_fee', 'Transfer fee', m.transferFeeBps / 100 > POLICY.maxTaxPct ? 'fail' : m.transferFeeBps > 0 ? 'warn' : 'pass', `${m.transferFeeBps / 100}%`, 'solana-rpc')));
    checks.push(check('transfer_hook', 'No transfer hook', m.transferHookProgram ? 'warn' : 'pass', m.transferHookProgram || 'none', 'solana-rpc', 'A hook program runs on every transfer and can block sells.'));
    checks.push(hard(check('transferable', 'Transferable / not frozen by default', m.nonTransferable || m.defaultAccountStateFrozen ? 'fail' : 'pass', m.nonTransferable ? 'non-transferable' : m.defaultAccountStateFrozen ? 'default frozen' : 'ok', 'solana-rpc')));
  } else {
    const a = j?.audit;
    const mint_ = g?.mintable ?? (a?.mintAuthorityDisabled == null ? null : !a.mintAuthorityDisabled);
    const frz = g?.freezable ?? (a?.freezeAuthorityDisabled == null ? null : !a.freezeAuthorityDisabled);
    const src = g ? 'goplus' : 'jupiter';
    checks.push(hard(check('mint_authority', 'Mint authority revoked', mint_ == null ? 'unknown' : mint_ ? 'fail' : 'pass', mint_ == null ? null : mint_ ? 'set' : 'none', src)));
    checks.push(hard(check('freeze_authority', 'Freeze authority revoked', frz == null ? 'unknown' : frz ? 'fail' : 'pass', frz == null ? null : frz ? 'set' : 'none', src)));
    checks.push(hard(check('permanent_delegate', 'No permanent delegate (Token-2022)', 'unknown', null, 'solana-rpc', 'RPC unavailable')));
    if (g) checks.push(hard(check('transfer_fee', 'Transfer fee', g.transferFee ? 'warn' : 'pass', g.transferFee ? JSON.stringify(g.transferFee) : '0%', 'goplus')));
  }

  const liq = top?.liquidityUsd ?? j?.liquidity ?? null;
  checks.push(hard(check('liquidity', `Pool liquidity ≥ $${POLICY.deskLiquidityUsd} (desk bar)`, liq == null ? 'unknown' : liq < POLICY.deskLiquidityUsd ? 'fail' : liq < POLICY.warnLiquidityUsd ? 'warn' : 'pass', liq, top ? 'dexscreener' : 'jupiter')));

  // Jupiter's audit excludes pool/curve accounts, so prefer it; GoPlus counts pool vaults as holders.
  const jt10 = j?.audit?.topHoldersPercentage ?? null;
  const top10 = jt10 ?? g?.top10Pct ?? null;
  checks.push(hard(check('top10', `Top-10 holders ≤ ${POLICY.maxTop10Pct}%`, top10 == null ? 'unknown' : top10 > POLICY.maxTop10Pct ? 'fail' : top10 > POLICY.warnTop10Pct ? 'warn' : 'pass', top10 == null ? null : Math.round(top10 * 100) / 100, jt10 != null ? 'jupiter' : 'goplus', jt10 != null ? 'Excludes pool accounts.' : 'Includes pool accounts.')));
  const a = j?.audit;
  if (a && (a.devMints != null || a.devBalancePercentage != null)) {
    const serial = (a.devMints ?? 0) >= POLICY.warnDevMints;
    const heavy = (a.devBalancePercentage ?? 0) > POLICY.warnDevBalancePct;
    checks.push(check('dev', 'Creator history and holdings', serial || heavy ? 'warn' : 'pass', `dev holds ${a.devBalancePercentage == null ? '?' : a.devBalancePercentage.toFixed(1)}% · ${a.devMints ?? '?'} tokens created · ${a.devMigrations ?? 0} graduated`, 'jupiter', 'Serial launchers (many tokens, few graduations) are a common rug pattern.'));
  }

  if (rcv) {
    // Liquidity is measured by our own hard check against the desk bar, so RugCheck's own
    // liquidity dangers are reported but not double-counted as a fail.
    const danger = rcv.risks.filter((x) => x.level === 'danger' && !/liquidity|LP providers/i.test(x.name));
    checks.push(check('rugcheck', 'RugCheck risks', danger.length ? 'fail' : rcv.risks.length ? 'warn' : 'pass', rcv.risks.map((x) => `${x.level}: ${x.name}`).join('; ') || 'none', 'rugcheck'));
    if (rcv.lpLockedPct != null && top?.dex !== 'pumpfun') checks.push(check('lp_locked', 'LP locked/burned', rcv.lpLockedPct < POLICY.warnLpLockedPct ? 'warn' : 'pass', Math.round(rcv.lpLockedPct * 10) / 10, 'rugcheck'));
  } else checks.push(check('rugcheck', 'RugCheck risks', 'unknown', null, 'rugcheck'));
  if (g?.metadataMutable != null) checks.push(check('metadata', 'Metadata immutable', g.metadataMutable ? 'warn' : 'pass', g.metadataMutable ? 'mutable' : 'immutable', 'goplus'));

  // Sellability: route ~$50 of the token back to SOL via Jupiter.
  const price = top?.priceUsd ?? j?.usdPrice;
  const decimals = m?.decimals ?? j?.decimals;
  if (price && decimals != null && !(input.skip || []).includes('sell')) {
    const raw = BigInt(Math.max(1, Math.floor((POLICY.probeUsd / price) * 10 ** Math.min(decimals, 12)))) * 10n ** BigInt(Math.max(0, decimals - 12));
    const sp = await sellProbe(mint, raw.toString());
    checks.push(hard(check('sell_route', `Sell route for $${POLICY.probeUsd} back to SOL`, sp.routable === null ? 'unknown' : !sp.routable ? 'fail' : sp.priceImpactPct > POLICY.warnPriceImpactPct ? 'warn' : 'pass', sp.routable ? `impact ${sp.priceImpactPct?.toFixed(2)}% via ${sp.routes.join('→') || '?'}` : sp.error || 'no route', 'jupiter')));
  } else checks.push(hard(check('sell_route', `Sell route for $${POLICY.probeUsd} back to SOL`, 'unknown', null, 'jupiter', 'no price')));

  return {
    token: { name: j?.name || top?.base.name || null, symbol: j?.symbol || top?.base.symbol || null, decimals: decimals ?? null, program: m?.program || j?.tokenProgram || null, launchpad: j?.launchpad || null, dev: j?.dev || null, holders: j?.holderCount ?? g?.holderCount ?? null, organicScore: j?.organicScoreLabel || null, verified: j?.verified ?? null },
    market: top ? { dex: top.dex, pair: top.pair, url: top.url, priceUsd: top.priceUsd, liquidityUsd: top.liquidityUsd, fdvUsd: top.fdvUsd, volume24hUsd: top.volume24hUsd, txns5m: top.txns5m, createdAt: top.createdAt, socials: top.socials, pairs: pairs.length } : j ? { priceUsd: j.usdPrice, liquidityUsd: j.liquidity, fdvUsd: j.mcap } : null,
    checks, errors,
    sources: ['dexscreener', 'rugcheck', 'goplus', 'jupiter', m ? `solana-rpc ${m.rpc}` : 'solana-rpc'].filter(Boolean),
  };
}

async function scanEvm(chain, address, input) {
  const [ds, hp, gp, hs] = await Promise.all([
    settle(tokenPairs(chain, [address])),
    settle(honeypotIs(chain, address)),
    settle(goplusEvm(chain, address)),
    HONEY_CHAINS[chain] && !(input.skip || []).includes('honeysim') ? settle(honeySim(chain, address)) : Promise.resolve({ ok: true, value: null }),
  ]);
  const errors = {};
  for (const [k, v] of Object.entries({ dexscreener: ds, 'honeypot.is': hp, goplus: gp, honeysim: hs })) if (!v.ok) errors[k] = v.error;
  const sim = hs.ok ? hs.value : null;
  const lc = address.toLowerCase();
  const pairs = ds.ok ? ds.value.filter((p) => p.base.address?.toLowerCase() === lc || p.quote.address?.toLowerCase() === lc) : [];
  const top = pairs[0] || null;
  const h = hp.ok ? hp.value : null;
  const g = gp.ok ? gp.value : null;
  const checks = [];
  const hard = (c) => Object.assign(c, { hard: true });

  const hpFlag = h?.honeypot ?? null;
  const gpFlag = g?.honeypot ?? null;
  const isHp = hpFlag === true || gpFlag === true;
  checks.push(hard(check('honeypot', 'Not a honeypot (buy+sell simulated)', hpFlag == null && gpFlag == null ? 'unknown' : isHp ? 'fail' : 'pass', h?.reason || (isHp ? 'flagged' : 'sell simulated ok'), [h && 'honeypot.is', g && 'goplus'].filter(Boolean).join('+'))));
  if (sim) {
    // Independent on-chain check (Blockchains fork of valamidev honeyCheck). A revert can also mean "no v2 pair", so it is a warning, not a fail.
    checks.push(check('onchain_sim', `On-chain buy→sell simulation (${sim.dex})`, !sim.simulated ? 'warn' : sim.honeypot ? 'fail' : Math.max(sim.buyTaxPct, sim.sellTaxPct - 0.7) > POLICY.maxTaxPct ? 'fail' : 'pass', sim.simulated ? `round trip −${sim.roundTripLossPct}% (incl. LP fees) · buy tax ${sim.buyTaxPct}%` : `reverted: ${sim.error}`, 'honeysim (eth_call)', 'Simulated in one read-only eth_call; nothing is signed or sent.'));
  }
  const buyTax = h?.buyTaxPct ?? g?.buyTaxPct ?? null;
  const sellTax = h?.sellTaxPct ?? g?.sellTaxPct ?? null;
  const tax = Math.max(buyTax ?? 0, sellTax ?? 0);
  checks.push(hard(check('tax', `Buy/sell tax ≤ ${POLICY.maxTaxPct}%`, buyTax == null && sellTax == null ? 'unknown' : tax > POLICY.maxTaxPct ? 'fail' : tax > POLICY.warnTaxPct ? 'warn' : 'pass', `buy ${buyTax ?? '?'}% / sell ${sellTax ?? '?'}%`, h ? 'honeypot.is' : 'goplus')));
  if (g) {
    const renounced = !g.owner || /^0x0{40}$/i.test(g.owner) || g.owner.toLowerCase() === '0x000000000000000000000000000000000000dead';
    checks.push(check('owner', 'Ownership renounced', renounced ? 'pass' : 'warn', g.owner || 'none', 'goplus'));
    checks.push(hard(check('owner_powers', 'No hidden owner / ownership takeback', g.hiddenOwner || g.canTakeBackOwnership ? 'fail' : 'pass', [g.hiddenOwner && 'hidden owner', g.canTakeBackOwnership && 'can take back ownership'].filter(Boolean).join(', ') || 'none', 'goplus')));
    checks.push(check('mintable', 'Not mintable', g.mintable ? (renounced ? 'warn' : 'fail') : 'pass', g.mintable ? 'mint function present' : 'no', 'goplus'));
    checks.push(check('controls', 'No blacklist / pause / tax switch', g.blacklist || g.transferPausable || g.slippageModifiable ? 'warn' : 'pass', [g.blacklist && 'blacklist', g.transferPausable && 'pausable', g.slippageModifiable && 'tax modifiable'].filter(Boolean).join(', ') || 'none', 'goplus'));
    checks.push(hard(check('verified', 'Source verified', g.openSource === false ? 'fail' : g.openSource ? 'pass' : 'unknown', g.openSource ? (g.proxy ? 'verified (proxy)' : 'verified') : 'unverified', 'goplus')));
    if (g.lpLockedPct != null) checks.push(check('lp_locked', 'LP locked/burned', g.lpLockedPct < POLICY.warnLpLockedPct ? 'warn' : 'pass', Math.round(g.lpLockedPct * 10) / 10, 'goplus', 'Uniswap v2-style LP tokens only.'));
  }
  const liq = top?.liquidityUsd ?? null;
  checks.push(hard(check('liquidity', `Pool liquidity ≥ $${POLICY.deskLiquidityUsd} (desk bar)`, liq == null ? 'unknown' : liq < POLICY.deskLiquidityUsd ? 'fail' : liq < POLICY.warnLiquidityUsd ? 'warn' : 'pass', liq, 'dexscreener')));
  const top10 = g?.top10Pct ?? null;
  checks.push(hard(check('top10', `Top-10 holders ≤ ${POLICY.maxTop10Pct}%`, top10 == null ? 'unknown' : top10 > POLICY.maxTop10Pct ? 'fail' : top10 > POLICY.warnTop10Pct ? 'warn' : 'pass', top10 == null ? null : Math.round(top10 * 100) / 100, 'goplus', 'Includes pool, burn and exchange accounts.')));

  return {
    token: { name: top?.base.name || null, symbol: top?.base.symbol || null, holders: g?.holderCount ?? null },
    market: top ? { dex: top.dex, pair: top.pair, url: top.url, priceUsd: top.priceUsd, liquidityUsd: top.liquidityUsd, fdvUsd: top.fdvUsd, volume24hUsd: top.volume24hUsd, txns5m: top.txns5m, createdAt: top.createdAt, socials: top.socials, pairs: pairs.length } : null,
    checks, errors, sources: ['dexscreener', 'honeypot.is', 'goplus', ...(sim ? ['honeysim'] : [])],
  };
}
