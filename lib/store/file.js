'use strict';
// Pilote de stockage « fichier » — DÉVELOPPEMENT LOCAL UNIQUEMENT (refusé en production/hébergement).
// Les données personnelles y sont tout de même chiffrées (champ pii_encrypted).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('../env');

function createFileStore(file = path.join(ROOT, '.data', 'dev-store.json')) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let chain = Promise.resolve();
  const empty = () => ({ packages: [], booking_requests: [], booking_request_events: [], contact_messages: [], admin_audit: [], admin_totp_steps: [], admin_users: [] });
  const load = () => { try { return { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return empty(); } };
  const save = (db) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 }); fs.renameSync(tmp, file); };
  // Sérialise les accès pour éviter les écritures concurrentes.
  const tx = (fn) => { const run = chain.then(() => { const db = load(); const r = fn(db); save(db); return r; }); chain = run.catch(() => {}); return run; };
  const read = (fn) => { const run = chain.then(() => fn(load())); chain = run.catch(() => {}); return run; };
  const now = () => new Date().toISOString();
  const uuid = () => crypto.randomUUID();
  const dup = () => Object.assign(new Error('duplicate'), { code: '23505' });

  return {
    driver: 'file',
    async health() { return { ok: true }; },

    async listPackages({ activeOnly = false } = {}) {
      return read((db) => db.packages.filter((p) => !activeOnly || p.is_active).sort((a, b) => a.sort_order - b.sort_order));
    },
    async upsertPackage(p) {
      return tx((db) => {
        const i = db.packages.findIndex((x) => x.id === p.id);
        const row = { ...(i >= 0 ? db.packages[i] : {}), ...p, updated_at: now() };
        if (i >= 0) db.packages[i] = row; else db.packages.push(row);
        return row;
      });
    },

    async createBookingRequest(rec) {
      return tx((db) => {
        if (db.booking_requests.some((r) => r.reference === rec.reference)) throw dup();
        if (rec.idempotency_hash && db.booking_requests.some((r) => r.idempotency_hash === rec.idempotency_hash)) throw dup();
        const row = { id: uuid(), created_at: now(), status: 'nouvelle', ...rec };
        db.booking_requests.push(row);
        db.booking_request_events.push({ id: uuid(), request_id: row.id, created_at: now(), kind: 'created', from_status: null, to_status: 'nouvelle', actor: 'system' });
        return row;
      });
    },
    async findBookingByIdempotency(hash) {
      return read((db) => db.booking_requests.find((r) => r.idempotency_hash === hash) || null);
    },
    async countRecentByIpHash(table, ipHash, sinceIso) {
      return read((db) => db[table].filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length);
    },
    async updateBookingMeta(id, patch) {
      return tx((db) => { const r = db.booking_requests.find((x) => x.id === id); if (r) Object.assign(r, patch); return r || null; });
    },
    async listBookingRequests({ status, from, to, limit = 500 } = {}) {
      return read((db) => db.booking_requests
        .filter((r) => (!status || r.status === status) && (!from || r.event_date >= from) && (!to || r.event_date <= to))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit));
    },
    async getBookingRequest(id) { return read((db) => db.booking_requests.find((r) => r.id === id) || null); },
    async updateBookingStatus(id, status, actor) {
      return tx((db) => {
        const r = db.booking_requests.find((x) => x.id === id);
        if (!r) return null;
        const from = r.status; r.status = status; r.updated_at = now();
        db.booking_request_events.push({ id: uuid(), request_id: id, created_at: now(), kind: 'status', from_status: from, to_status: status, actor });
        return r;
      });
    },
    async addEvent(requestId, ev) {
      return tx((db) => {
        if (!db.booking_requests.find((x) => x.id === requestId)) return null;
        const rec = { id: uuid(), request_id: requestId, created_at: now(), kind: ev.kind, from_status: ev.from_status || null, to_status: ev.to_status || null, actor: ev.actor || null, note_encrypted: ev.note_encrypted || null };
        db.booking_request_events.push(rec);
        return rec;
      });
    },
    async listEvents(requestId) {
      return read((db) => db.booking_request_events.filter((e) => e.request_id === requestId).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
    },
    async deleteBookingRequest(id) {
      return tx((db) => {
        const n = db.booking_requests.length;
        db.booking_requests = db.booking_requests.filter((r) => r.id !== id);
        db.booking_request_events = db.booking_request_events.filter((e) => e.request_id !== id);
        return n - db.booking_requests.length;
      });
    },

    async createContactMessage(rec) {
      return tx((db) => {
        if (db.contact_messages.some((r) => r.reference === rec.reference)) throw dup();
        const row = { id: uuid(), created_at: now(), status: 'nouveau', ...rec };
        db.contact_messages.push(row);
        return row;
      });
    },
    async listContactMessages({ limit = 200 } = {}) {
      return read((db) => [...db.contact_messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit));
    },
    async updateContactStatus(id, status) {
      return tx((db) => { const r = db.contact_messages.find((x) => x.id === id); if (r) r.status = status; return r || null; });
    },
    async deleteContactMessage(id) {
      return tx((db) => { const n = db.contact_messages.length; db.contact_messages = db.contact_messages.filter((r) => r.id !== id); return n - db.contact_messages.length; });
    },

    async addAudit(entry) { return tx((db) => { db.admin_audit.push({ id: uuid(), created_at: now(), ...entry }); }); },
    async countAuditFailures(field, value, sinceIso) {
      return read((db) => db.admin_audit.filter((a) => a.action === 'login_failed' && a[field] === value && a.created_at >= sinceIso).length);
    },
    async listAudit({ limit = 100 } = {}) {
      return read((db) => [...db.admin_audit].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit));
    },
    async listAdmins() { return read((db) => db.admin_users.map((a) => ({ email: a.email, role: a.role || 'admin' }))); },
    async isAdminEmail(email) { return read((db) => db.admin_users.some((a) => a.email === email)); },
    async claimTotpStep(step) {
      return tx((db) => {
        if (db.admin_totp_steps.some((s) => s.step === step)) return false;
        db.admin_totp_steps.push({ step, used_at: now() });
        db.admin_totp_steps = db.admin_totp_steps.slice(-50);
        return true;
      });
    },
    async purgeOlderThan(cutoffIso) {
      return tx((db) => {
        const ids = new Set(db.booking_requests.filter((r) => r.created_at < cutoffIso).map((r) => r.id));
        const nb = ids.size;
        const nc = db.contact_messages.filter((r) => r.created_at < cutoffIso).length;
        db.booking_requests = db.booking_requests.filter((r) => !ids.has(r.id));
        db.booking_request_events = db.booking_request_events.filter((e) => !ids.has(e.request_id));
        db.contact_messages = db.contact_messages.filter((r) => r.created_at >= cutoffIso);
        return { booking_requests: nb, contact_messages: nc };
      });
    }
  };
}

module.exports = { createFileStore };
