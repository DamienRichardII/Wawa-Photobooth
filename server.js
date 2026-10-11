'use strict';
// Serveur local de développement : fichiers statiques (public/) + routes /api/* (mêmes handlers que Vercel).
// Usage : npm run dev   → http://localhost:3000   (stockage « file » local, jamais en production)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SECURITY_HEADERS } = require('./lib/http');

const PUBLIC = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT || '3000', 10);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml'
};

const API = {
  '/api/booking-requests': require('./api/booking-requests'),
  '/api/contact': require('./api/contact'),
  '/api/packages': require('./api/packages'),
  '/api/cron-purge': require('./api/cron-purge')
};
const ADMIN = require('./api/admin/[action]');

function applyHeaders(res, extra = {}) {
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) res.setHeader(k, v);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.includes('\0')) { res.statusCode = 400; return res.end(); }
  let file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end('Forbidden'); }
  try {
    let st = fs.statSync(file);
    if (st.isDirectory()) {
      if (!pathname.endsWith('/')) { res.statusCode = 301; res.setHeader('Location', pathname + '/'); return res.end(); }
      file = path.join(file, 'index.html'); st = fs.statSync(file);
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size };
    headers['Cache-Control'] = /\.(webp|mp4|woff2|png|jpg)$/.test(ext) ? 'public, max-age=31536000, immutable' : 'no-cache';
    applyHeaders(res, headers);
    if (req.method === 'HEAD') return res.end();
    // Support Range pour les vidéos (lecture/seek)
    const range = req.headers.range;
    if (range && ext === '.mp4') {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m[1] ? parseInt(m[1], 10) : 0; const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    fs.createReadStream(file).pipe(res);
  } catch {
    const nf = path.join(PUBLIC, '404.html');
    res.statusCode = 404;
    applyHeaders(res, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams);
  if (url.pathname.startsWith('/api/')) {
    applyHeaders(res);
    const m = /^\/api\/admin\/([a-z-]+)$/.exec(url.pathname);
    if (m) { req.query.action = m[1]; return ADMIN(req, res); }
    const h = API[url.pathname];
    if (h) return h(req, res);
    res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end('{"error":"not_found"}');
  }
  serveStatic(req, res, url.pathname);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`WAWA PHOTOBOOTH — http://localhost:${PORT}  (stockage : ${process.env.STORAGE_DRIVER || 'non configuré'})`));
}
module.exports = server;
