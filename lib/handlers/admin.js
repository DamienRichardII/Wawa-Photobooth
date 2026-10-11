'use strict';
const { send, HttpError, readJson, ipHash, checkOrigin, wrap } = require('../http');
const { getBackend } = require('../store');
const { verifyPassword, hmacHex, safeEqual, decrypt, DUMMY_HASH } = require('../crypto');
const { verifyTotp } = require('../totp');
const { createSession, clearCookie, getSession } = require('../session');
const { isHosted, seedPackages } = require('../env');
const rl = require('../ratelimit');

const STATUSES = ['nouvelle', 'a-contacter', 'devis-envoye', 'confirmee', 'annulee'];
const CONTACT_STATUSES = ['nouveau', 'traite'];
const FAMILIES = ['numerique', 'tirages', 'autre'];
const LOCK_WINDOW_MS = 15 * 60 * 1000;

function adminConfig() {
  const e = process.env;
  const missing = [];
  if (!e.ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
  if (!e.ADMIN_PASSWORD_HASH) missing.push('ADMIN_PASSWORD_HASH');
  if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (>= 32 caractères)');
  const mfaOptional = !isHosted() && e.ADMIN_ALLOW_NO_MFA === 'true';
  if (!e.ADMIN_TOTP_SECRET && !mfaOptional) missing.push('ADMIN_TOTP_SECRET');
  return { ok: missing.length === 0, missing, mfaRequired: !mfaOptional };
}

function requireSession(req, { csrf = false } = {}) {
  const s = getSession(req);
  if (!s) throw new HttpError(401, 'unauthorized');
  if (csrf) {
    checkOrigin(req);
    if (!safeEqual(String(req.headers['x-csrf-token'] || ''), s.csrf)) throw new HttpError(403, 'csrf');
  }
  return s;
}

function openPii(row, key) {
  try { return JSON.parse(decrypt(row.pii_encrypted, key, row.reference)); } catch { return null; }
}
function bookingView(row, key, { full = false } = {}) {
  const pii = openPii(row, key);
  const base = {
    id: row.id, reference: row.reference, created_at: row.created_at, status: row.status,
    event_type: row.event_type, event_date: row.event_date, start_time: row.start_time, guest_count: row.guest_count,
    installation_type: row.installation_type, photobooth_requested: row.photobooth_requested, magnet_bar_requested: row.magnet_bar_requested === true,
    package_snapshot: row.package_snapshot, notify_status: row.notify_status, ack_status: row.ack_status,
    name: pii ? `${pii.first_name} ${pii.last_name}` : null, email: pii ? pii.email : null, phone: pii ? pii.phone : null,
    decrypt_error: !pii
  };
  if (full && pii) Object.assign(base, { event_address: pii.event_address, address_place_id: pii.address_place_id, event_type_other: pii.event_type_other, couple_first_names: pii.couple_first_names, marketing_consent: row.marketing_consent });
  return base;
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise l'injection de formules (tableurs)
  return `"${s.replace(/"/g, '""')}"`;
};

async function audit(store, req, actor, action, detail = {}, extra = {}) {
  try { await store.addAudit({ actor, action, ip_hash: ipHash(req), detail, ...extra }); } catch { /* non bloquant */ }
}

async function login(req, res, store) {
  checkOrigin(req);
  const cfg = adminConfig();
  if (!cfg.ok) throw new HttpError(503, 'admin_not_configured', { missing: cfg.missing });
  const ip = ipHash(req);
  const m = rl.hit(`login:${ip}`, 10, LOCK_WINDOW_MS);
  if (!m.ok) throw new HttpError(429, 'rate_limited', { retryAfter: m.retryAfter });

  const body = await readJson(req, 2048);
  const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 254);
  const password = String((body && body.password) || '').slice(0, 256);
  const code = String((body && body.code) || '').replace(/\s/g, '');
  const emailHash = hmacHex(process.env.SESSION_SECRET, `adm:${email}`, 32);
  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  if ((await store.countAuditFailures('ip_hash', ip, since)) >= 10 || (await store.countAuditFailures('email_hash', emailHash, since)) >= 5) {
    throw new HttpError(429, 'locked', { retryAfter: 900 });
  }

  const emailOk = safeEqual(email, String(process.env.ADMIN_EMAIL).trim().toLowerCase());
  const passOk = await verifyPassword(password, emailOk ? process.env.ADMIN_PASSWORD_HASH : DUMMY_HASH);
  let step = null;
  if (cfg.mfaRequired) step = verifyTotp(process.env.ADMIN_TOTP_SECRET, code);
  let mfaOk = !cfg.mfaRequired || step !== null;
  // Le code TOTP n'est « consommé » qu'après validation de l'identifiant et du mot de passe (pas de verrouillage involontaire),
  // et ne peut servir qu'une fois (anti-rejeu).
  if (emailOk && passOk && mfaOk && cfg.mfaRequired) mfaOk = await store.claimTotpStep(step);
  if (!(emailOk && passOk && mfaOk)) {
    await audit(store, req, null, 'login_failed', {}, { email_hash: emailHash });
    throw new HttpError(401, 'invalid_credentials');
  }
  const { cookie, payload } = createSession(email);
  await audit(store, req, email, 'login_ok');
  res.setHeader('Set-Cookie', cookie);
  send(res, 200, { ok: true, email, csrf: payload.csrf, expires_at: payload.exp });
}

function validatePackage(b) {
  const errors = {};
  const o = {};
  if (typeof b.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(b.id)) errors.id = 'Identifiant invalide (a-z, 0-9, - _).'; else o.id = b.id;
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80) errors.name = 'Nom requis (80 max).'; else o.name = b.name.trim();
  o.description = b.description ? String(b.description).slice(0, 300) : null;
  if (!FAMILIES.includes(b.family)) errors.family = 'Famille invalide.'; else o.family = b.family;
  o.print_allowance = b.print_allowance ? String(b.print_allowance).slice(0, 60) : null;
  if (b.duration_hours === null || b.duration_hours === undefined || b.duration_hours === '') o.duration_hours = null;
  else if (typeof b.duration_hours !== 'number' || !(b.duration_hours > 0 && b.duration_hours <= 48)) errors.duration_hours = 'Durée invalide.'; else o.duration_hours = b.duration_hours;
  if (b.price_eur === null || b.price_eur === undefined || b.price_eur === '') o.price_eur = null;
  else if (typeof b.price_eur !== 'number' || !(b.price_eur >= 0 && b.price_eur <= 100000)) errors.price_eur = 'Prix invalide.'; else o.price_eur = b.price_eur;
  o.is_active = b.is_active === true;
  o.is_featured = b.is_featured === true;
  o.sort_order = Number.isInteger(b.sort_order) ? b.sort_order : 0;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: o };
}

module.exports = wrap('admin', async (req, res) => {
  const action = String((req.query && req.query.action) || '').toLowerCase();
  const { store, key, reason } = getBackend();
  if (!store) throw new HttpError(503, 'service_not_configured', { reason });
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://x');

  if (action === 'login') { if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed'); return login(req, res, store); }
  if (action === 'status-check') { const c = adminConfig(); return send(res, 200, { configured: c.ok, missing: c.ok ? [] : c.missing }); }

  if (action === 'logout') {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const s = getSession(req);
    if (s) { checkOrigin(req); await audit(store, req, s.sub, 'logout'); }
    res.setHeader('Set-Cookie', clearCookie());
    return send(res, 200, { ok: true });
  }
  if (action === 'me') {
    const s = requireSession(req);
    return send(res, 200, { email: s.sub, csrf: s.csrf, expires_at: s.exp });
  }

  if (action === 'requests') {
    const s = requireSession(req);
    const p = url.searchParams;
    const status = STATUSES.includes(p.get('status')) ? p.get('status') : undefined;
    const rows = await store.listBookingRequests({ status, from: /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '') ? p.get('from') : undefined, to: /^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '') ? p.get('to') : undefined, limit: 1000 });
    let items = rows.map((r) => bookingView(r, key));
    const q = (p.get('q') || '').trim().toLowerCase();
    if (q) items = items.filter((i) => [i.reference, i.name, i.email, i.phone, i.event_type].some((x) => x && String(x).toLowerCase().includes(q)));
    await audit(store, req, s.sub, 'list_requests', { count: items.length });
    return send(res, 200, { items: items.slice(0, 500), total: items.length, statuses: STATUSES });
  }
  if (action === 'request') {
    const s = requireSession(req);
    const id = url.searchParams.get('id') || '';
    const row = await store.getBookingRequest(id);
    if (!row) throw new HttpError(404, 'not_found');
    await audit(store, req, s.sub, 'view_request', { reference: row.reference });
    return send(res, 200, { request: bookingView(row, key, { full: true }), events: await store.listEvents(id) });
  }
  if (action === 'status') {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const s = requireSession(req, { csrf: true });
    const b = await readJson(req, 1024);
    if (!b || !STATUSES.includes(b.status) || typeof b.id !== 'string') throw new HttpError(422, 'validation');
    const row = await store.updateBookingStatus(b.id, b.status, s.sub);
    if (!row) throw new HttpError(404, 'not_found');
    await audit(store, req, s.sub, 'status_change', { reference: row.reference, to: b.status });
    return send(res, 200, { ok: true, status: row.status });
  }
  if (action === 'delete') {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const s = requireSession(req, { csrf: true });
    const b = await readJson(req, 1024);
    if (!b || typeof b.id !== 'string' || (b.kind !== 'request' && b.kind !== 'message')) throw new HttpError(422, 'validation');
    const n = b.kind === 'request' ? await store.deleteBookingRequest(b.id) : await store.deleteContactMessage(b.id);
    await audit(store, req, s.sub, 'delete_' + b.kind, { deleted: n });
    return send(res, 200, { ok: true, deleted: n });
  }
  if (action === 'export') {
    const s = requireSession(req, { csrf: true });
    const p = url.searchParams;
    const status = STATUSES.includes(p.get('status')) ? p.get('status') : undefined;
    const rows = (await store.listBookingRequests({ status, limit: 500 })).map((r) => bookingView(r, key, { full: true }));
    const cols = ['reference', 'created_at', 'status', 'event_type', 'event_date', 'start_time', 'guest_count', 'installation_type', 'photobooth_requested', 'magnet_bar_requested', 'formule', 'name', 'email', 'phone', 'event_address'];
    const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(c === 'formule' ? (r.package_snapshot && r.package_snapshot.name) : r[c])).join(',')));
    await audit(store, req, s.sub, 'export', { count: rows.length, status: status || 'all' });
    return send(res, 200, lines.join('\r\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="demandes-wawa.csv"' });
  }

  if (action === 'messages') {
    const s = requireSession(req);
    const rows = await store.listContactMessages({ limit: 200 });
    const items = rows.map((r) => {
      let pii = null; try { pii = JSON.parse(decrypt(r.pii_encrypted, key, r.reference)); } catch { /* */ }
      return { id: r.id, reference: r.reference, created_at: r.created_at, status: r.status, ...(pii || {}), decrypt_error: !pii };
    });
    await audit(store, req, s.sub, 'list_messages', { count: items.length });
    return send(res, 200, { items, statuses: CONTACT_STATUSES });
  }
  if (action === 'message-status') {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const s = requireSession(req, { csrf: true });
    const b = await readJson(req, 1024);
    if (!b || !CONTACT_STATUSES.includes(b.status) || typeof b.id !== 'string') throw new HttpError(422, 'validation');
    const row = await store.updateContactStatus(b.id, b.status);
    if (!row) throw new HttpError(404, 'not_found');
    await audit(store, req, s.sub, 'message_status', { reference: row.reference, to: b.status });
    return send(res, 200, { ok: true });
  }

  if (action === 'packages') {
    requireSession(req);
    const rows = await store.listPackages();
    return send(res, 200, rows.length ? { packages: rows, source: 'database' } : { packages: seedPackages().packages, source: 'config' });
  }
  if (action === 'package') {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const s = requireSession(req, { csrf: true });
    const v = validatePackage(await readJson(req, 4096));
    if (!v.ok) throw new HttpError(422, 'validation', { fields: v.errors });
    await store.upsertPackage(v.value);
    await audit(store, req, s.sub, 'package_upsert', { id: v.value.id });
    return send(res, 200, { ok: true });
  }
  if (action === 'seed-packages') {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const s = requireSession(req, { csrf: true });
    const existing = await store.listPackages();
    if (existing.length) throw new HttpError(409, 'already_seeded');
    for (const p of seedPackages().packages) await store.upsertPackage({ description: null, ...p });
    await audit(store, req, s.sub, 'packages_seeded', { count: seedPackages().packages.length });
    return send(res, 200, { ok: true });
  }
  if (action === 'audit') {
    requireSession(req);
    return send(res, 200, { items: await store.listAudit({ limit: 100 }) });
  }
  throw new HttpError(404, 'not_found');
});
