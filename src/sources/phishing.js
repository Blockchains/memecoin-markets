// Domain deny-list check for token websites/socials, using polkadot-js/phishing (Apache-2.0)
// via the Blockchains fork https://github.com/Blockchains/phishing (upstream as fallback).
import { fetchJson } from '../http.js';

export const PHISHING_LISTS = ['https://raw.githubusercontent.com/Blockchains/phishing/master/all.json', 'https://raw.githubusercontent.com/polkadot-js/phishing/master/all.json'];

export async function loadDenyList(opts) {
  let last;
  for (const url of PHISHING_LISTS) {
    try { const d = await fetchJson('phishing', url, { retries: 1, timeoutMs: 30000, ...opts }); return { url, deny: new Set(d.deny || []), allow: new Set(d.allow || []) }; } catch (e) { last = e; }
  }
  throw last;
}

export const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };

/** Returns { checked: [hosts], flagged: [hosts] }. A host is flagged if it or any parent domain is denied and not allowed. */
export function checkUrls(urls, list) {
  const hosts = [...new Set((urls || []).map(hostOf).filter(Boolean))];
  const flagged = hosts.filter((h) => {
    if (list.allow.has(h)) return false;
    const parts = h.split('.');
    for (let i = 0; i < parts.length - 1; i++) if (list.deny.has(parts.slice(i).join('.'))) return true;
    return false;
  });
  return { checked: hosts, flagged };
}
