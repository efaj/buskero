import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, process.env.STATIC_ROOT || '.');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

const ALLOWED_ROOT_FILES = new Set(['index.html', 'LICENSE']);
const ALLOWED_ROOT_DIRS = new Set(['src', 'styles']);

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self), midi=(self)',
  'X-Content-Type-Options': 'nosniff',
});

export function resolveSafePath(urlPathname, rootDir = DEFAULT_ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }
  const cleanPath = decoded === '/' ? '/index.html' : decoded;
  const relative = cleanPath.replace(/^\/+/, '');
  const segments = relative.split('/');
  const firstSegment = segments[0];
  if (firstSegment.startsWith('.')) {
    return null;
  }
  if (segments.length === 1) {
    if (!ALLOWED_ROOT_FILES.has(firstSegment)) return null;
  } else if (!ALLOWED_ROOT_DIRS.has(firstSegment)) {
    return null;
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolved;
}

export function createBuskeroServer({ rootDir = DEFAULT_ROOT, host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  const server = http.createServer(async (req, res) => {
    if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('Method Not Allowed');
      return;
    }

    const parsedUrl = new URL(req.url, `http://${host}:${port || 3000}`);
    const filePath = resolveSafePath(parsedUrl.pathname, rootDir);

    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('Forbidden');
      return;
    }

    try {
      let targetPath = filePath;
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        targetPath = path.join(targetPath, 'index.html');
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const data = await fs.readFile(targetPath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.byteLength,
        'Cache-Control': 'no-cache',
        ...SECURITY_HEADERS,
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(data);
      }
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
        res.end('Not Found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('Internal Server Error');
    }
  });

  return server;
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const server = createBuskeroServer();
  server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
    console.log(`Buskero running at http://${DEFAULT_HOST}:${DEFAULT_PORT} (root: ${DEFAULT_ROOT})`);
  });
}
