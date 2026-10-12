// RugCheck public report summary (https://api.rugcheck.xyz/swagger). Solana only. CORS: *.
import { fetchJson, num } from '../http.js';

export async function rugcheckSummary(mint, opts) {
  const d = await fetchJson('rugcheck', `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report/summary`, opts);
  return {
    source: 'rugcheck',
    score: num(d.score),
    scoreNormalised: num(d.score_normalised),
    lpLockedPct: num(d.lpLockedPct),
    tokenProgram: d.tokenProgram || null,
    risks: (d.risks || []).map((r) => ({ name: r.name, level: r.level, description: r.description, value: r.value || '' })),
  };
}
