// Serves the built frontend (bundled as ./dist) from Lambda behind the HTTP
// API's $default route — the fallback when CloudFront isn't available
// (enable_cdn = false). Unknown paths without a file extension get index.html
// so the SPA's own routing works.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('./dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8', // /openapi.yaml: shown, not downloaded
};
// Same security headers and CSP as gateway/nginx.conf.
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
};

async function load(rel) {
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return null; // no ../ escapes
  try { return { file, body: await readFile(file) }; } catch { return null; }
}

export async function handler(event) {
  const rel = decodeURIComponent(event.rawPath || '/').replace(/^\/+/, '') || 'index.html';
  let hit = await load(rel);
  if (!hit && !path.extname(rel)) hit = await load('index.html');
  if (!hit) return { statusCode: 404, headers: { ...SECURITY, 'content-type': 'text/plain' }, body: 'Not found' };

  const ext = path.extname(hit.file);
  const immutable = rel.startsWith('assets/'); // hashed by Vite
  return {
    statusCode: 200,
    headers: {
      ...SECURITY,
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
    body: hit.body.toString('base64'),
    isBase64Encoded: true,
  };
}
