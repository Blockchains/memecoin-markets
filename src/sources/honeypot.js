// honeypot.is simulation API (buy+sell simulated on a fork). EVM only. CORS: *.
import { fetchJson, num } from '../http.js';
import { EVM_CHAIN_ID } from './goplus.js';

export async function honeypotIs(chain, address, opts) {
  const id = EVM_CHAIN_ID[chain] || chain;
  const d = await fetchJson('honeypot.is', `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${id}`, opts);
  return {
    source: 'honeypot.is',
    simulated: !!d.simulationSuccess,
    honeypot: d.honeypotResult ? !!d.honeypotResult.isHoneypot : null,
    reason: d.honeypotResult?.honeypotReason || null,
    buyTaxPct: num(d.simulationResult?.buyTax),
    sellTaxPct: num(d.simulationResult?.sellTax),
    transferTaxPct: num(d.simulationResult?.transferTax),
    risk: d.summary?.risk || null,
    flags: (d.summary?.flags || d.flags || []).map((f) => (typeof f === 'string' ? f : f.flag || f.description)),
    pair: d.pair?.pair?.name || null,
    openSource: d.contractCode ? !!d.contractCode.openSource : null,
    proxy: d.contractCode ? !!d.contractCode.isProxy : null,
  };
}
