// Tiny static server for e2e (mirrors GitHub Pages: CORS *, correct MIME types).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown' };
export function serve(root = '_site', port = 0, prefix = '') {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (prefix) { if (!p.startsWith(prefix)) { res.writeHead(404); return res.end('not found'); } p = '/' + p.slice(prefix.length); }
    p = normalize(p).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'access-control-allow-origin': '*' }); res.end(b); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}
if (import.meta.url === `file://${process.argv[1]}`) { const s = await serve(process.argv[2] || '_site', Number(process.argv[3] || 8080)); console.log('http://127.0.0.1:' + s.address().port); }
