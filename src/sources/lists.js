// Community lists from Blockchains forks, read straight from raw.githubusercontent.com (keyless, CORS *):
//  - Blockchains/tokenLists (SmolDapp tokenlistooor: curated popular token list per EVM chain)
//  - Blockchains/default-token-list (Uniswap default token list)
//  - Blockchains/scam-database (ScamSniffer scam addresses + domains)
//  - Blockchains/eth-phishing-detect (MetaMask phishing blocklist)
//  - Blockchains/web3icons (SVG token logos keyed by CoinGecko id)
import { fetchJson } from '../http.js';

const RAW = 'https://raw.githubusercontent.com/Blockchains';
export const CHAIN_ID = { ethereum: 1, bsc: 56, base: 8453, arbitrum: 42161, polygon: 137, avalanche: 43114, optimism: 10, linea: 59144, blast: 81457 };
export const UNISWAP_FILES = { ethereum: 'mainnet', base: 'base', bsc: 'bnb', arbitrum: 'arbitrum', polygon: 'polygon', avalanche: 'avalanche', optimism: 'optimism', blast: 'blast' };
export const LIST_URLS = {
  tokenlistooor: (chain) => `${RAW}/tokenLists/main/lists/${CHAIN_ID[chain]}.json`,
  uniswap: (chain) => `${RAW}/default-token-list/main/src/tokens/${UNISWAP_FILES[chain]}.json`,
  scamAddresses: `${RAW}/scam-database/main/blacklist/address.json`,
  scamDomains: `${RAW}/scam-database/main/blacklist/domains.json`,
  metamask: `${RAW}/eth-phishing-detect/main/src/config.json`,
  web3iconsMeta: `${RAW}/web3icons/main/packages/common/src/metadata/tokens.json`,
  web3iconSvg: (file, variant = 'branded') => `${RAW}/web3icons/main/packages/core/src/svgs/tokens/${variant}/${file}.svg`,
};

/** Map of lower-case address -> { name, symbol, logoURI } for one chain's token list. */
export async function loadTokenList(kind, chain, opts) {
  if (kind === 'tokenlistooor' && !CHAIN_ID[chain]) return new Map();
  if (kind === 'uniswap' && !UNISWAP_FILES[chain]) return new Map();
  const d = await fetchJson(kind, LIST_URLS[kind](chain), { retries: 1, timeoutMs: 30000, ...opts });
  const toks = Array.isArray(d) ? d : d.tokens || [];
  return new Map(toks.filter((t) => !CHAIN_ID[chain] || !t.chainId || t.chainId === CHAIN_ID[chain]).map((t) => [String(t.address).toLowerCase(), { name: t.name, symbol: t.symbol, logoURI: t.logoURI || null }]));
}

/** ScamSniffer address + domain blacklists and the MetaMask blocklist, as Sets. */
export async function loadScamLists(opts) {
  const o = { retries: 1, timeoutMs: 30000, ...opts };
  const [addr, doms, mm] = await Promise.allSettled([fetchJson('scam-database', LIST_URLS.scamAddresses, o), fetchJson('scam-database', LIST_URLS.scamDomains, o), fetchJson('eth-phishing-detect', LIST_URLS.metamask, o)]);
  if (addr.status === 'rejected' && doms.status === 'rejected' && mm.status === 'rejected') throw addr.reason;
  return {
    addresses: new Set((addr.value || []).map((a) => String(a).toLowerCase())),
    scamDomains: new Set((doms.value || []).map((d) => String(d).toLowerCase())),
    metamaskDeny: new Set((mm.value?.blacklist || []).map((d) => String(d).toLowerCase())),
    metamaskAllow: new Set((mm.value?.whitelist || []).map((d) => String(d).toLowerCase())),
  };
}

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };
// Shared hosting roots: a listing of the shared host itself (e.g. sites.google.com) says nothing about one project's page.
export const SHARED_HOSTS = new Set(['sites.google.com', 'docs.google.com', 'medium.com', 'github.io', 'github.com', 'linktr.ee', 't.me', 'x.com', 'twitter.com', 'discord.gg', 'discord.com', 'gitbook.io', 'notion.site', 'vercel.app', 'netlify.app', 'pages.dev', 'wixsite.com', 'carrd.co', 'youtube.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'reddit.com']);
const parents = (h) => { const p = h.split('.'); return p.slice(0, -1).map((_, i) => p.slice(i).join('.')); };
/** Check token contract/pool addresses and link hosts against the scam lists. */
export function checkScam({ addresses = [], urls = [] }, lists) {
  const addrHits = addresses.filter(Boolean).map((a) => String(a).toLowerCase()).filter((a) => lists.addresses.has(a));
  const hosts = [...new Set(urls.map(hostOf).filter(Boolean))];
  const domainHits = [];
  for (const h of hosts) {
    if (lists.metamaskAllow.has(h)) continue;
    for (const p of parents(h)) {
      if (SHARED_HOSTS.has(p)) break;
      if (lists.scamDomains.has(p)) { domainHits.push({ host: h, list: 'scam-database' }); break; }
      if (lists.metamaskDeny.has(p)) { domainHits.push({ host: h, list: 'eth-phishing-detect' }); break; }
    }
  }
  return { addressHits: addrHits, domainHits, checkedAddresses: addresses.filter(Boolean).length, checkedHosts: hosts.length };
}

/** web3icons metadata: Map coingeckoId -> { file, variants, symbol }. */
export async function loadWeb3Icons(opts) {
  const d = await fetchJson('web3icons', LIST_URLS.web3iconsMeta, { retries: 1, timeoutMs: 30000, ...opts });
  return new Map(d.filter((x) => x.id && x.filePath).map((x) => [x.id, { file: x.filePath.replace(/^token:/, ''), variants: x.variants || [], symbol: x.symbol }]));
}

/** tokenlistooor sub-lists checked for "listed on N token lists" coverage (missing per chain are skipped). */
export const TOKENLISTOOOR_SUBLISTS = ['1inch', 'coingecko', 'cowswap', 'lifi', 'paraswap', 'etherscan', 'uniswap', 'ledger', 'aerodrome', 'portals', 'defillama', 'bebop', 'sushiswap'];
/**
 * Load the tokenlistooor sub-lists plus the Uniswap default list for one chain.
 * Returns Map lower-case address -> [list names].
 */
export async function listCoverage(chain, opts) {
  const id = CHAIN_ID[chain]; const out = new Map(); const loaded = [];
  if (!id) return { chain, lists: loaded, byAddress: out };
  const add = (name, toks) => { loaded.push(name); for (const t of toks) { const a = String(t.address).toLowerCase(); if (t.chainId && t.chainId !== id) continue; const v = out.get(a) || []; if (!v.includes(name)) v.push(name); out.set(a, v); } };
  const jobs = [['tokenlistooor-popular', `${RAW}/tokenLists/main/lists/${id}.json`], ...TOKENLISTOOOR_SUBLISTS.map((n) => [n, `${RAW}/tokenLists/main/lists/${id}/${n}.json`])];
  if (UNISWAP_FILES[chain]) jobs.push(['uniswap-default', LIST_URLS.uniswap(chain)]);
  await Promise.all(jobs.map(async ([name, url]) => { try { const d = await fetchJson('tokenlists', url, { retries: 0, timeoutMs: 60000, ...opts }); add(name, Array.isArray(d) ? d : d.tokens || []); } catch { /* not published for this chain */ } }));
  return { chain, lists: loaded.sort(), byAddress: out };
}
