// On-chain honeypot + tax simulation with the community honeyCheck contracts from
// valamidev/web3-defi-honeypot-and-slippage-checker (MIT), forked as
// https://github.com/Blockchains/web3-defi-honeypot-and-slippage-checker .
// One read-only eth_call: the contract buys with 0.5 native coin through a Uniswap-v2 style router,
// approves and sells back. Nothing is signed or sent; a state override funds the caller for the call.
import { fetchJson } from '../http.js';

export const HONEY_SELECTOR = '0xaaece8bd'; // keccak256("honeyCheck(address,address)")[0..4], verified in test/unit
export const TEST_WEI = 5n * 10n ** 17n;
/** Per chain: free public RPC, checker contract (from the fork's README) and the v2 router it simulates through. */
export const HONEY_CHAINS = {
  ethereum: { rpc: 'https://ethereum-rpc.publicnode.com', checker: '0xe7e07a2281f1e66e938ae7feefc69db181329f12', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', dex: 'Uniswap v2' },
  base: { rpc: 'https://base-rpc.publicnode.com', checker: '0x6135e522e17141f01EE62D3dC4841A751788b475', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', dex: 'Uniswap v2' },
  bsc: { rpc: 'https://bsc-rpc.publicnode.com', checker: '0x385826FBd70DfBB0a7188eE790A36E1fe4f6fc34', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', dex: 'PancakeSwap v2' },
  arbitrum: { rpc: 'https://arbitrum-one-rpc.publicnode.com', checker: '0x0aa2037E40a78A169B5214418D66377ab828cb23', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', dex: 'SushiSwap v2' },
  polygon: { rpc: 'https://polygon-bor-rpc.publicnode.com', checker: '0xc817b3a104B7d48e3B9C4fbfd624e5D5F03757e0', router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', dex: 'QuickSwap v2' },
  avalanche: { rpc: 'https://avalanche-c-chain-rpc.publicnode.com', checker: '0x2B30ddE904B22c0Bba6019543231c857e0Be1DfB', router: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4', dex: 'Trader Joe v1' },
};
const CALLER = '0x000000000000000000000000000000000000bEEF';
const word = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

export function encodeHoneyCheck(token, router) { return HONEY_SELECTOR + word(token) + word(router); }

/** Decode the 6-word HoneyResponse and derive taxes. LP fees (2 × ~0.3 %) are inside roundTripLossPct. */
export function decodeHoneyResult(hex) {
  const w = (hex || '').replace(/^0x/, '').match(/.{64}/g);
  if (!w || w.length < 6) throw new Error('short honeyCheck result');
  const [buyResult, leftOver, sellResult, buyGas, sellGas, expected] = w.map((x) => BigInt('0x' + x));
  const ratio = (a, b) => (b === 0n ? 0 : Number((a * 1000000n) / b) / 1e6);
  const buyTaxPct = Math.max(0, (1 - ratio(buyResult, expected)) * 100);
  const roundTripLossPct = (1 - ratio(sellResult, TEST_WEI)) * 100;
  const sellTaxPct = Math.max(0, roundTripLossPct - buyTaxPct);
  return { buyResult: buyResult.toString(), leftOver: leftOver.toString(), sellResult: sellResult.toString(), expected: expected.toString(), buyGas: Number(buyGas), sellGas: Number(sellGas), buyTaxPct: +buyTaxPct.toFixed(3), sellTaxPct: +sellTaxPct.toFixed(3), roundTripLossPct: +roundTripLossPct.toFixed(3), honeypot: sellResult === 0n };
}

/** Simulate buy → approve → sell for an EVM token. Reverts are reported as honeypot:null with the reason (could also be "no v2 pair"). */
export async function honeySim(chain, token, opts = {}) {
  const c = HONEY_CHAINS[chain];
  if (!c) throw new Error(`honeySim: no checker for ${chain}`);
  const body = { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ from: CALLER, to: c.checker, gas: '0x44aa20', gasPrice: '0x0', value: '0x' + TEST_WEI.toString(16), data: encodeHoneyCheck(token, opts.router || c.router) }, 'latest', { [CALLER]: { balance: '0x' + (10n ** 21n).toString(16) } }] };
  const d = await fetchJson('honeysim', opts.rpc || c.rpc, { method: 'POST', body, retries: 1, timeoutMs: 15000 });
  if (d?.error) return { source: 'honeysim', chain, dex: c.dex, simulated: false, honeypot: null, error: String(d.error.message || 'reverted').slice(0, 160) };
  return { source: 'honeysim', chain, dex: c.dex, simulated: true, ...decodeHoneyResult(d.result) };
}
