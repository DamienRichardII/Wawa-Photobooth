'use strict';
const crypto = require('crypto');
const { hmacHex } = require('./crypto');
const { isProduction } = require('./env');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "connect-src 'self' https://data.geopf.fr",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY'
};

function send(res, status, body, extra = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.statusCode = status;
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra };
  for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
  res.end(payload);
}

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

/** Lit un corps JSON (déjà parsé par Vercel, ou en flux), taille plafonnée. */
async function readJson(req, limit = 16 * 1024) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type');
  const len = parseInt(req.headers['content-length'] || '0', 10);
  if (len > limit) throw new HttpError(413, 'payload_too_large');
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
      const s = req.body.toString('utf8');
      if (s.length > limit) throw new HttpError(413, 'payload_too_large');
      try { return JSON.parse(s); } catch { throw new HttpError(400, 'invalid_json'); }
    }
    if (JSON.stringify(req.body).length > limit) throw new HttpError(413, 'payload_too_large');
    return req.body;
  }
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'payload_too_large');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch { throw new HttpError(400, 'invalid_json'); }
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}
function ipSecret() { return process.env.IP_HASH_SECRET || process.env.SESSION_SECRET || 'dev-only-ip-secret'; }
function ipHash(req) { return hmacHex(ipSecret(), clientIp(req), 32); }

/** Contrôle d'origine (anti-CSRF pour les requêtes qui modifient des données). */
function checkOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const allowed = new Set();
  if (process.env.SITE_ORIGIN) process.env.SITE_ORIGIN.split(',').forEach((o) => allowed.add(o.trim().replace(/\/$/, '')));
  if (!origin) {
    // Navigateurs : POST fetch envoie toujours Origin. Absent = client non navigateur → on refuse en production.
    if (isProduction()) throw new HttpError(403, 'origin_required');
    return;
  }
  let o;
  try { o = new URL(origin); } catch { throw new HttpError(403, 'bad_origin'); }
  if (allowed.size) { if (!allowed.has(o.origin)) throw new HttpError(403, 'bad_origin'); return; }
  if (o.host !== host) throw new HttpError(403, 'bad_origin');
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');

/** Enveloppe commune : gère les HttpError et ne journalise jamais de données personnelles. */
function wrap(name, fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, ...(e.extra || {}) }, e.status === 429 && e.extra && e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {});
      console.error(`[${name}] erreur technique:`, e && e.code ? e.code : e && e.message ? e.message : 'unknown'); // aucun payload
      if (!res.headersSent) send(res, 500, { error: 'internal_error' });
    }
  };
}

module.exports = { CSP, SECURITY_HEADERS, send, HttpError, readJson, clientIp, ipHash, checkOrigin, parseCookies, randomToken, wrap };
