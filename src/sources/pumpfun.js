// pump.fun bonding-curve reader. Read-only, keyless: account layouts come from the official Anchor IDL in
// the Blockchains fork of pump-fun/pump-public-docs (https://github.com/Blockchains/pump-public-docs, idl/pump.json),
// account bytes come from a public Solana RPC. Nothing is signed or sent.
import { fetchJson } from '../http.js';
import { solanaRpc, base58 } from './solana-rpc.js';
import { newPools, GT_NETWORK, normalisePool } from './geckoterminal.js';

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_IDL_URLS = ['https://raw.githubusercontent.com/Blockchains/pump-public-docs/main/idl/pump.json', 'https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/idl/pump.json'];
// Fallback curve size when the Global account cannot be read (pump.fun default: 793.1M tokens sold on the curve, 6 decimals).
export const DEFAULT_INITIAL_REAL_TOKEN_RESERVES = 793100000000000n;

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58Decode(s) {
  let n = 0n;
  for (const ch of s) { const i = ALPHABET.indexOf(ch); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch === '1') out.unshift(0); else break; }
  return Uint8Array.from(out);
}

// ---- ed25519 on-curve test (needed for Solana PDA derivation; no dependencies) ----
const P = 2n ** 255n - 19n;
const D = (-121665n * inv(121666n)) % P + P;
function mod(a) { const r = a % P; return r < 0n ? r + P : r; }
function pow(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; } return r; }
function inv(a) { return pow(a, P - 2n); }
export function isOnCurve(bytes) {
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  if (y >= P) return false;
  const y2 = mod(y * y); const u = mod(y2 - 1n); const v = mod(D * y2 + 1n);
  const x2 = mod(u * inv(v));
  if (x2 === 0n) return (bytes[31] & 0x80) === 0;
  return pow(x2, (P - 1n) / 2n) === 1n; // quadratic residue => a point exists
}

async function sha256(bytes) { return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)); }
const enc = new TextEncoder();
/** Solana findProgramAddress: returns [base58 address, bump]. */
export async function findProgramAddress(seeds, programId) {
  const prog = base58Decode(programId); const marker = enc.encode('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds.map((s) => (typeof s === 'string' ? enc.encode(s) : s)), Uint8Array.of(bump), prog, marker];
    const buf = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    const h = await sha256(buf);
    if (!isOnCurve(h)) return [base58(h), bump];
  }
  throw new Error('no PDA');
}
export const bondingCurveAddress = async (mint) => (await findProgramAddress(['bonding-curve', base58Decode(mint)], PUMP_PROGRAM))[0];
export const globalAddress = async () => (await findProgramAddress(['global'], PUMP_PROGRAM))[0];

// ---- IDL-driven Borsh decoder (subset used by pump accounts; stops cleanly on truncated older accounts) ----
let idlCache = null;
export async function loadIdl(opts) {
  if (idlCache) return idlCache;
  let last;
  for (const url of PUMP_IDL_URLS) { try { idlCache = { url, ...(await fetchJson('pump-idl', url, { retries: 1, timeoutMs: 20000, ...opts })) }; return idlCache; } catch (e) { last = e; } }
  throw last;
}
const SIZES = { u8: 1, i8: 1, bool: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8, u128: 16, i128: 16, pubkey: 32 };
function readPrim(t, b, o) {
  const n = SIZES[t]; if (o + n > b.length) return undefined;
  if (t === 'bool') return b[o] === 1;
  if (t === 'pubkey') return base58(b.slice(o, o + 32));
  let v = 0n; for (let i = n - 1; i >= 0; i--) v = (v << 8n) + BigInt(b[o + i]);
  if (t[0] === 'i' && v >= 1n << BigInt(n * 8 - 1)) v -= 1n << BigInt(n * 8);
  return n <= 4 ? Number(v) : v;
}
/** Decode an IDL account by name. Returns fields as JS values (u64 as BigInt); fields past the end of an older, shorter account are omitted. */
export function decodeAccount(idl, name, bytes) {
  const acc = idl.accounts.find((a) => a.name === name); if (!acc) throw new Error(`IDL has no account ${name}`);
  const disc = acc.discriminator;
  if (!disc.every((x, i) => bytes[i] === x)) throw new Error(`not a ${name} account (discriminator mismatch)`);
  const ty = idl.types.find((t) => t.name === name).type;
  const out = {}; let o = 8;
  for (const f of ty.fields) {
    if (typeof f.type === 'string' && SIZES[f.type]) { const v = readPrim(f.type, bytes, o); if (v === undefined) break; out[f.name] = v; o += SIZES[f.type]; }
    else if (f.type.array && SIZES[f.type.array[0]]) { const [t, n] = f.type.array; if (o + SIZES[t] * n > bytes.length) break; out[f.name] = Array.from({ length: n }, (_, i) => readPrim(t, bytes, o + i * SIZES[t])); o += SIZES[t] * n; }
    else break; // unsupported type: stop (all fields we use come first)
  }
  return out;
}

/** Progress of a curve towards graduation (0-100), SOL raised and price in SOL per token. */
export function curveStats(c, initialRealTokenReserves = DEFAULT_INITIAL_REAL_TOKEN_RESERVES) {
  const real = BigInt(c.real_token_reserves ?? 0n); const init = BigInt(initialRealTokenReserves);
  const progress = c.complete ? 100 : init > 0n ? Math.max(0, Math.min(100, Number(((init - real) * 10000n) / init) / 100)) : null;
  const vq = Number(c.virtual_quote_reserves ?? c.virtual_sol_reserves ?? 0n); const vt = Number(c.virtual_token_reserves ?? 0n);
  return { complete: !!c.complete, progressPct: progress, solRaised: Number(c.real_quote_reserves ?? 0n) / 1e9, priceSol: vt ? (vq / 1e9) / (vt / 1e6) : null, creator: c.creator || null, mayhemMode: c.is_mayhem_mode ?? null, cashback: c.is_cashback_coin ?? null, creatorFeeBps: c.creator_fee_bps != null ? Number(c.creator_fee_bps) : null };
}

const b64 = (s) => (typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** Read pump.fun bonding curves for up to 100 mints in one getMultipleAccounts call. Mints that never used pump.fun return null. */
export async function bondingCurves(mints, opts = {}) {
  const idl = await loadIdl(opts);
  const list = mints.slice(0, 99);
  const pdas = await Promise.all(list.map(bondingCurveAddress));
  const gAddr = await globalAddress();
  const { result, rpc } = await solanaRpc('getMultipleAccounts', [[gAddr, ...pdas], { encoding: 'base64' }], opts);
  const [g, ...accs] = result.value;
  let init = DEFAULT_INITIAL_REAL_TOKEN_RESERVES;
  try { if (g) init = decodeAccount(idl, 'Global', b64(g.data[0])).initial_real_token_reserves || init; } catch { /* keep default */ }
  const out = {};
  list.forEach((m, i) => {
    const a = accs[i];
    if (!a || a.owner !== PUMP_PROGRAM) { out[m] = null; return; }
    try { out[m] = { mint: m, bondingCurve: pdas[i], ...curveStats(decodeAccount(idl, 'BondingCurve', b64(a.data[0])), init) }; } catch (e) { out[m] = { mint: m, bondingCurve: pdas[i], error: e.message }; }
  });
  return { rpc, idl: idl.url, initialRealTokenReserves: String(init), curves: out };
}
export async function bondingCurve(mint, opts) { return (await bondingCurves([mint], opts)).curves[mint]; }

/** GeckoTerminal pools for the pump.fun bonding curve DEX and PumpSwap (graduated), keyless. */
export async function pumpPools(dex = 'pump-fun', { sort = 'h24_volume_usd_desc' } = {}, opts) {
  const d = await fetchJson('geckoterminal', `https://api.geckoterminal.com/api/v2/networks/${GT_NETWORK.solana}/dexes/${dex}/pools?include=base_token&sort=${sort}`, { headers: { accept: 'application/json;version=20230302' }, ...opts });
  return (d.data || []).map((p) => normalisePool(p, d.included || []));
}

