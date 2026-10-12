// Tiny static server for e2e (mirrors GitHub Pages: CORS *, correct MIME types).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown' };
export function serve(root = '_site', port = 0) {
  const srv = createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'access-control-allow-origin': '*' }); res.end(b); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}
if (import.meta.url === `file://${process.argv[1]}`) { const s = await serve(process.argv[2] || '_site', Number(process.argv[3] || 8080)); console.log('http://127.0.0.1:' + s.address().port); }
