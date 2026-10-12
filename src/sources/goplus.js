// GoPlus Security token API — the same public endpoints wrapped by
// GoPlusSecurity/goplus-sdk-node (Apache-2.0). No key needed at low volume. CORS: allowed.
import { fetchJson, num } from '../http.js';

const BASE = 'https://api.gopluslabs.io/api/v1';
/** EVM chain ids GoPlus accepts. */
export const EVM_CHAIN_ID = { ethereum: 1, bsc: 56, base: 8453, arbitrum: 42161, polygon: 137 };

const pctSum = (holders, n = 10) => (holders || []).slice(0, n).reduce((s, h) => s + (num(h.percent) || 0), 0) * 100;

export async function goplusSolana(mint, opts) {
  const d = await fetchJson('goplus', `${BASE}/solana/token_security?contract_addresses=${encodeURIComponent(mint)}`, opts);
  const r = d?.result?.[mint] || Object.values(d?.result || {})[0];
  if (!r) return null;
  const st = (x) => (x?.status === undefined ? null : x.status === '1');
  return {
    source: 'goplus',
    mintable: st(r.mintable),
    freezable: st(r.freezable),
    metadataMutable: st(r.metadata_mutable),
    closable: st(r.closable),
    transferFee: r.transfer_fee && Object.keys(r.transfer_fee).length ? r.transfer_fee : null,
    transferHook: Array.isArray(r.transfer_hook) && r.transfer_hook.length > 0,
    nonTransferable: r.non_transferable === '1',
    holderCount: num(r.holder_count),
    top10Pct: r.holders?.length ? pctSum(r.holders) : null,
    trusted: r.trusted_token === '1',
    dexTvlUsd: (r.dex || []).reduce((s, x) => s + (num(x.tvl) || 0), 0),
  };
}

export async function goplusEvm(chain, address, opts) {
  const id = EVM_CHAIN_ID[chain] || chain;
  const d = await fetchJson('goplus', `${BASE}/token_security/${id}?contract_addresses=${address.toLowerCase()}`, opts);
  const r = d?.result?.[address.toLowerCase()];
  if (!r) return null;
  const b = (v) => (v === undefined || v === '' ? null : v === '1');
  const lpLocked = (r.lp_holders || []).reduce((s, h) => s + (h.is_locked === 1 ? num(h.percent) || 0 : 0), 0) * 100;
  return {
    source: 'goplus',
    honeypot: b(r.is_honeypot),
    buyTaxPct: r.buy_tax === '' ? null : num(r.buy_tax) * 100,
    sellTaxPct: r.sell_tax === '' ? null : num(r.sell_tax) * 100,
    mintable: b(r.is_mintable),
    openSource: b(r.is_open_source),
    proxy: b(r.is_proxy),
    hiddenOwner: b(r.hidden_owner),
    canTakeBackOwnership: b(r.can_take_back_ownership),
    blacklist: b(r.is_blacklisted),
    transferPausable: b(r.transfer_pausable),
    slippageModifiable: b(r.slippage_modifiable),
    owner: r.owner_address || null,
    holderCount: num(r.holder_count),
    top10Pct: r.holders?.length ? pctSum(r.holders) : null,
    lpLockedPct: r.lp_holders ? lpLocked : null,
  };
}
