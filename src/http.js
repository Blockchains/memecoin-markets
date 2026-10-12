// Minimal fetch helper shared by every source. Works in browsers and Node >= 20.
// No API keys: every upstream used here is a free, CORS-enabled public endpoint.

export class UpstreamError extends Error {
  constructor(source, url, status, message) {
    super(`${source}: ${message} (${status ?? 'network'}) ${url}`);
    this.source = source;
    this.url = url;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET/POST JSON with timeout and small retry on 429/5xx/network errors.
 * @param {string} source short upstream name for errors/provenance
 * @param {string} url
 * @param {{method?:string, body?:any, headers?:Record<string,string>, timeoutMs?:number, retries?:number, fetch?:typeof fetch}} [opts]
 */
export async function fetchJson(source, url, opts = {}) {
  const { method = 'GET', body, headers = {}, timeoutMs = 15000, retries = 2 } = opts;
  const f = opts.fetch || globalThis.fetch;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await f(url, {
        method,
        signal: ctrl.signal,
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(source, url, res.status, 'upstream busy');
        await sleep(600 * (attempt + 1) * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        let detail = '';
        try { const t = await res.text(); try { const j = JSON.parse(t); detail = j.error || j.message || j.errorCode || t; } catch { detail = t; } } catch { /* ignore */ }
        throw new UpstreamError(source, url, res.status, String(detail || 'HTTP error').slice(0, 160));
      }
      return await res.json();
    } catch (e) {
      lastErr = e instanceof UpstreamError ? e : new UpstreamError(source, url, null, e?.name === 'AbortError' ? 'timeout' : String(e?.message || e));
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

export const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
