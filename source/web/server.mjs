import { createServer } from 'node:http';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';

const here = fileURLToPath(new URL('./', import.meta.url));
export function createStaticServer(directory = join(here, 'dist')) {
  if (!statSync(join(directory, 'index.html')).isFile()) throw new Error('Run npm run build before serving');
  const assets = sirv(directory, { etag: true, maxAge: 0, single: false, dotfiles: false });
  return createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Authorize only the exact authored dataLayer bootstrap and Google's tag
    // loader. Keep eval, arbitrary inline scripts and ad-specific hosts blocked.
    // The HTML integration test checks this hash against the emitted script.
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'sha256-ncN3GiMXXUNS5+4lYiHaTmEmdKZkqNRyoFhUZpR8Bco=' https://www.googletagmanager.com; connect-src https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com; style-src 'self'; img-src 'self' https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed\n');
    }
    const pathname = (req.url ?? '/').split('?')[0];
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : 'ok\n');
    }
    assets(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : 'Not found\n');
    });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createStaticServer();
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port, '0.0.0.0', () => console.log('Static site listening on port ' + port));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}
