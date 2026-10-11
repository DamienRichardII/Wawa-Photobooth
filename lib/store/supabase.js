'use strict';
// Pilote Supabase (PostgREST) — utilise la clé « service_role » UNIQUEMENT côté serveur.
// Les tables ont RLS activée sans politique : le navigateur ne peut rien lire (voir supabase/migrations).
function createSupabaseStore({ url, serviceKey, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '') + '/rest/v1';
  const headers = (extra = {}) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...extra });

  async function rest(method, table, { query = '', body, prefer } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetchImpl(`${base}/${table}${query ? '?' + query : ''}`, {
        method, headers: headers(prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal
      });
      const text = await res.text();
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = null; } }
      if (!res.ok) {
        const err = new Error('supabase_error');
        err.status = res.status; err.code = data && data.code ? data.code : String(res.status);
        throw err; // jamais de corps de réponse dans l'erreur : il peut contenir des données
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  const enc = encodeURIComponent;
  const one = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);
  const REP = 'return=representation';

  return {
    driver: 'supabase',
    async health() { await rest('GET', 'packages', { query: 'select=id&limit=1' }); return { ok: true }; },

    async listPackages({ activeOnly = false } = {}) {
      return rest('GET', 'packages', { query: `select=*&order=sort_order.asc${activeOnly ? '&is_active=eq.true' : ''}` });
    },
    async upsertPackage(p) {
      return one(await rest('POST', 'packages', { query: 'on_conflict=id', body: { ...p, updated_at: new Date().toISOString() }, prefer: `${REP},resolution=merge-duplicates` }));
    },

    async createBookingRequest(rec) { return one(await rest('POST', 'booking_requests', { body: rec, prefer: REP })); },
    async findBookingByIdempotency(hash) { return one(await rest('GET', 'booking_requests', { query: `select=*&idempotency_hash=eq.${enc(hash)}&limit=1` })); },
    async countRecentByIpHash(table, ipHash, sinceIso) {
      const rows = await rest('GET', table, { query: `select=id&ip_hash=eq.${enc(ipHash)}&created_at=gte.${enc(sinceIso)}&limit=1000` });
      return rows.length;
    },
    async updateBookingMeta(id, patch) { return one(await rest('PATCH', 'booking_requests', { query: `id=eq.${enc(id)}`, body: patch, prefer: REP })); },
    async listBookingRequests({ status, from, to, limit = 500 } = {}) {
      let q = `select=*&order=created_at.desc&limit=${Math.min(limit, 1000)}`;
      if (status) q += `&status=eq.${enc(status)}`;
      if (from) q += `&event_date=gte.${enc(from)}`;
      if (to) q += `&event_date=lte.${enc(to)}`;
      return rest('GET', 'booking_requests', { query: q });
    },
    async getBookingRequest(id) { return one(await rest('GET', 'booking_requests', { query: `select=*&id=eq.${enc(id)}&limit=1` })); },
    async updateBookingStatus(id, status, actor) {
      const cur = await this.getBookingRequest(id);
      if (!cur) return null;
      const row = one(await rest('PATCH', 'booking_requests', { query: `id=eq.${enc(id)}`, body: { status, updated_at: new Date().toISOString() }, prefer: REP }));
      await rest('POST', 'booking_request_events', { body: { request_id: id, kind: 'status', from_status: cur.status, to_status: status, actor } });
      return row;
    },
    async listEvents(requestId) { return rest('GET', 'booking_request_events', { query: `select=*&request_id=eq.${enc(requestId)}&order=created_at.asc` }); },
    async deleteBookingRequest(id) { const r = await rest('DELETE', 'booking_requests', { query: `id=eq.${enc(id)}`, prefer: REP }); return r ? r.length : 0; },

    async createContactMessage(rec) { return one(await rest('POST', 'contact_messages', { body: rec, prefer: REP })); },
    async listContactMessages({ limit = 200 } = {}) { return rest('GET', 'contact_messages', { query: `select=*&order=created_at.desc&limit=${limit}` }); },
    async updateContactStatus(id, status) { return one(await rest('PATCH', 'contact_messages', { query: `id=eq.${enc(id)}`, body: { status }, prefer: REP })); },
    async deleteContactMessage(id) { const r = await rest('DELETE', 'contact_messages', { query: `id=eq.${enc(id)}`, prefer: REP }); return r ? r.length : 0; },

    async addAudit(entry) { await rest('POST', 'admin_audit', { body: entry }); },
    async countAuditFailures(field, value, sinceIso) {
      const rows = await rest('GET', 'admin_audit', { query: `select=id&action=eq.login_failed&${field}=eq.${enc(value)}&created_at=gte.${enc(sinceIso)}&limit=100` });
      return rows.length;
    },
    async listAudit({ limit = 100 } = {}) { return rest('GET', 'admin_audit', { query: `select=*&order=created_at.desc&limit=${limit}` }); },
    async claimTotpStep(step) {
      try { await rest('POST', 'admin_totp_steps', { body: { step } }); return true; }
      catch (e) { if (e.code === '23505' || e.status === 409) return false; throw e; }
    },
    async purgeOlderThan(cutoffIso) {
      const b = await rest('DELETE', 'booking_requests', { query: `created_at=lt.${enc(cutoffIso)}`, prefer: REP });
      const c = await rest('DELETE', 'contact_messages', { query: `created_at=lt.${enc(cutoffIso)}`, prefer: REP });
      return { booking_requests: b ? b.length : 0, contact_messages: c ? c.length : 0 };
    }
  };
}

module.exports = { createSupabaseStore };
