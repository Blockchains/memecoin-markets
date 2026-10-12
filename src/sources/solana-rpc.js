// Solana JSON-RPC mint inspection (SPL Token + Token-2022 extensions).
// Endpoint choice comes from the Blockchain Lab rpc-health dataset (Blockchains/blockchainlab-api).
import { fetchJson } from '../http.js';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_HEALTH = 'https://blockchains.github.io/blockchainlab-api/v1/rpc-health.json';
// api.mainnet-beta.solana.com answers 403 to browser Origins, so browsers default to publicnode.
const BROWSER_OK = ['https://solana-rpc.publicnode.com'];
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/** Healthy free Solana RPCs from Blockchains/blockchainlab-api (falls back to publicnode). */
export async function solanaRpcCandidates(opts = {}) {
  if (opts.rpc) return [opts.rpc];
  let list = [];
  try {
    const d = await fetchJson('blockchainlab-api', RPC_HEALTH, { retries: 0, timeoutMs: 8000 });
    list = (d.data || []).filter((r) => r.chain === 'solana' && r.healthy).sort((a, b) => a.latency_ms - b.latency_ms).map((r) => r.url);
  } catch { /* offline or blocked: use defaults */ }
  if (isBrowser) list = list.filter((u) => BROWSER_OK.includes(u));
  return [...new Set([...list, ...BROWSER_OK])];
}

export async function solanaRpc(method, params, opts = {}) {
  const urls = await solanaRpcCandidates(opts);
  let last;
  for (const url of urls) {
    try {
      const d = await fetchJson('solana-rpc', url, { method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params }, retries: 1, ...opts });
      if (d.error) throw new Error(`${d.error.code} ${d.error.message}`);
      return { result: d.result, rpc: url };
    } catch (e) { last = e; }
  }
  throw last || new Error('no solana rpc');
}

/** Parsed mint: authorities, supply and the Token-2022 extensions that matter for rugs. */
export async function getMint(mint, opts) {
  const { result, rpc } = await solanaRpc('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }], opts);
  const v = result?.value;
  if (!v) return { source: 'solana-rpc', rpc, exists: false };
  const info = v.data?.parsed?.info;
  if (v.data?.parsed?.type !== 'mint' || !info) return { source: 'solana-rpc', rpc, exists: true, isMint: false, owner: v.owner };
  const ext = Object.fromEntries((info.extensions || []).map((e) => [e.extension, e.state || {}]));
  const tf = ext.transferFeeConfig;
  return {
    source: 'solana-rpc', rpc, exists: true, isMint: true,
    program: v.owner === TOKEN_2022_PROGRAM ? 'token-2022' : v.owner === TOKEN_PROGRAM ? 'spl-token' : v.owner,
    decimals: info.decimals,
    supply: info.supply,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    extensions: Object.keys(ext),
    transferFeeBps: tf ? Number(tf.newerTransferFee?.transferFeeBasisPoints ?? tf.olderTransferFee?.transferFeeBasisPoints ?? 0) : 0,
    transferFeeAuthority: tf?.transferFeeConfigAuthority ?? null,
    transferHookProgram: ext.transferHook?.programId ?? null,
    permanentDelegate: ext.permanentDelegate?.delegate ?? null,
    nonTransferable: 'nonTransferable' in ext,
    defaultAccountStateFrozen: ext.defaultAccountState?.accountState === 'frozen',
    pausable: ext.pausableConfig ? !!ext.pausableConfig.authority : false,
  };
}

// ---- Offline decoder for the classic 82-byte Mint layout (used by tests + offline mode) ----
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let s = '';
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const u32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 2 ** 24);
const u64 = (b, o) => { let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) + BigInt(b[o + i]); return v; };

/** Decode Mint { mintAuthority COption<Pubkey>, supply u64, decimals u8, isInitialized bool, freezeAuthority COption<Pubkey> }. */
export function decodeMint(bytes) {
  if (bytes.length < 82) throw new Error('mint account too short');
  return {
    mintAuthority: u32(bytes, 0) === 1 ? base58(bytes.slice(4, 36)) : null,
    supply: u64(bytes, 36).toString(),
    decimals: bytes[44],
    isInitialized: bytes[45] === 1,
    freezeAuthority: u32(bytes, 46) === 1 ? base58(bytes.slice(50, 82)) : null,
  };
}
