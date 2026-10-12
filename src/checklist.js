// Launch checklist for a token team (or a buyer checking a team's claims). Auto items are
// evaluated from a scanToken() result; manual items are a plain list the operator ticks.
export const LAUNCH_ITEMS = [
  { id: 'mint_authority', text: 'Mint authority revoked', auto: true, chains: ['solana'] },
  { id: 'freeze_authority', text: 'Freeze authority revoked', auto: true, chains: ['solana'] },
  { id: 'permanent_delegate', text: 'No Token-2022 permanent delegate', auto: true, chains: ['solana'] },
  { id: 'transfer_fee', text: 'No transfer fee (or disclosed and ≤ 10%)', auto: true, chains: ['solana'] },
  { id: 'transfer_hook', text: 'No transfer hook', auto: true, chains: ['solana'] },
  { id: 'honeypot', text: 'Buy and sell both simulate successfully', auto: true, chains: ['evm'] },
  { id: 'tax', text: 'Buy/sell tax ≤ 10% and disclosed', auto: true, chains: ['evm'] },
  { id: 'owner', text: 'Contract ownership renounced or behind a timelock/multisig', auto: true, chains: ['evm'] },
  { id: 'verified', text: 'Source code verified on the explorer', auto: true, chains: ['evm'] },
  { id: 'metadata', text: 'Metadata made immutable after launch', auto: true, chains: ['solana'] },
  { id: 'lp_locked', text: 'LP burned or locked (≥ 50%, ideally ~100%)', auto: true, chains: ['solana', 'evm'] },
  { id: 'liquidity', text: 'Pool liquidity above $10k', auto: true, chains: ['solana', 'evm'], passOn: ['pass'] },
  { id: 'top10', text: 'Top-10 holders ≤ 50% (excluding pools)', auto: true, chains: ['solana', 'evm'], passOn: ['pass'] },
  { id: 'sell_route', text: 'A $50 sell routes back to SOL with < 10% impact', auto: true, chains: ['solana'] },
  { id: 'socials', text: 'Website/X/Telegram listed on the DexScreener profile', auto: true, chains: ['solana', 'evm'] },
  { id: 'disclosure', text: 'Team wallets, allocations and vesting published', auto: false },
  { id: 'no_promises', text: 'No promised returns, presale "guarantees" or price targets in marketing', auto: false },
  { id: 'jurisdiction', text: 'Promotion rules checked for your audience (e.g. UK FCA financial promotions regime)', auto: false },
  { id: 'keys', text: 'Deployer and treasury keys on hardware wallets / multisig', auto: false },
];

/** Evaluate the auto items against a scan result. Returns [{id,text,state:'done'|'todo'|'unknown'|'n/a',evidence}] */
export function evaluateChecklist(scan) {
  const fam = scan.chain === 'solana' ? 'solana' : 'evm';
  const byId = Object.fromEntries((scan.checks || []).map((c) => [c.id, c]));
  return LAUNCH_ITEMS.map((it) => {
    if (!it.auto) return { id: it.id, text: it.text, state: 'manual', evidence: null };
    if (it.chains && !it.chains.includes(fam)) return { id: it.id, text: it.text, state: 'n/a', evidence: null };
    if (it.id === 'socials') {
      const s = scan.market?.socials || [];
      return { id: it.id, text: it.text, state: scan.market ? (s.length ? 'done' : 'todo') : 'unknown', evidence: s.join(' ') || null };
    }
    const c = byId[it.id];
    if (!c) return { id: it.id, text: it.text, state: 'unknown', evidence: null };
    const ok = (it.passOn || ['pass']).includes(c.status);
    return { id: it.id, text: it.text, state: c.status === 'unknown' ? 'unknown' : ok ? 'done' : 'todo', evidence: `${c.value ?? ''} (${c.source})` };
  });
}
