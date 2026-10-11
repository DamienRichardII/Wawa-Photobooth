'use strict';
const { send, HttpError, readJson, ipHash, checkOrigin, wrap } = require('../http');
const { getBackend } = require('../store');
const { validateBooking } = require('../validate');
const { loadActivePackages } = require('../packages');
const { encrypt, hmacHex, newReference } = require('../crypto');
const rl = require('../ratelimit');
const mailer = require('../mailer');

const FIELD_ERRORS = (errors) => {
  const fields = {};
  for (const [k, v] of Object.entries(errors)) if (!k.startsWith('_')) fields[k] = v;
  return fields;
};

module.exports = wrap('booking-requests', async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  checkOrigin(req);

  const { store, key, reason } = getBackend();
  if (!store) throw new HttpError(503, 'service_not_configured', { reason });

  const ip = ipHash(req);
  const lim = rl.hit(`booking:${ip}`, 5, 10 * 60 * 1000);
  if (!lim.ok) throw new HttpError(429, 'rate_limited', { retryAfter: lim.retryAfter });

  const body = await readJson(req);
  const packages = await loadActivePackages(store);
  const v = validateBooking(body, { packageIds: packages.map((p) => p.id) });
  if (!v.ok) {
    const spam = Object.keys(v.errors).some((k) => k === '_spam' || k === '_unknown' || k === '_body');
    if (spam) throw new HttpError(400, 'invalid_request');
    throw new HttpError(422, 'validation', { fields: FIELD_ERRORS(v.errors) });
  }
  const d = v.value;

  // Limite quotidienne côté base (robuste en environnement serverless)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  if ((await store.countRecentByIpHash('booking_requests', ip, since)) >= 15) throw new HttpError(429, 'rate_limited', { retryAfter: 3600 });

  // Idempotence : un renvoi (double clic, réseau instable) ne crée pas de doublon
  const idemHash = d.idempotency_key ? hmacHex(key, `idem:${d.idempotency_key}`, 40) : null;
  if (idemHash) {
    const existing = await store.findBookingByIdempotency(idemHash);
    if (existing) return send(res, 200, { reference: existing.reference, received: true, ack_email_sent: existing.ack_status === 'sent', duplicate: true });
  }

  const pkg = d.photobooth_package_id ? packages.find((p) => p.id === d.photobooth_package_id) : null;
  // Instantané SERVEUR de la formule (le prix n'est jamais lu depuis le client)
  const snapshot = pkg ? { id: pkg.id, name: pkg.name, print_allowance: pkg.print_allowance || null, duration_hours: pkg.duration_hours || null, price_eur: pkg.price_eur ?? null } : null;

  let row = null;
  for (let attempt = 0; attempt < 4 && !row; attempt++) {
    const reference = newReference('WAWA');
    const pii = {
      first_name: d.first_name, last_name: d.last_name, email: d.email, phone: d.phone,
      event_address: d.event_address, address_place_id: d.address_place_id,
      event_type_other: d.event_type_other, couple_first_names: d.couple_first_names
    };
    try {
      row = await store.createBookingRequest({
        reference,
        event_type: d.event_type, event_date: d.event_date, start_time: d.start_time, guest_count: d.guest_count,
        installation_type: d.installation_type, photobooth_requested: d.photobooth_requested, magnet_bar_requested: d.magnet_bar_requested,
        package_id: d.photobooth_package_id, package_snapshot: snapshot,
        pii_encrypted: encrypt(JSON.stringify(pii), key, reference),
        marketing_consent: d.marketing_consent, idempotency_hash: idemHash, ip_hash: ip,
        notify_status: 'pending', ack_status: 'pending'
      });
    } catch (e) {
      if (e.code === '23505' || e.status === 409) {
        if (idemHash) { const ex = await store.findBookingByIdempotency(idemHash); if (ex) return send(res, 200, { reference: ex.reference, received: true, ack_email_sent: ex.ack_status === 'sent', duplicate: true }); }
        continue; // collision de référence : nouvelle tentative
      }
      throw e;
    }
  }
  if (!row) throw new HttpError(500, 'internal_error');

  // Notifications : secondaires, ne font jamais échouer une demande déjà enregistrée
  const team = await mailer.notifyTeamBooking({ reference: row.reference, event_type: d.event_type, event_date: d.event_date });
  const ack = await mailer.ackClient({ to: d.email, reference: row.reference });
  try { await store.updateBookingMeta(row.id, { notify_status: team.status, ack_status: ack.status }); } catch { /* non bloquant */ }

  send(res, 201, { reference: row.reference, received: true, ack_email_sent: ack.status === 'sent' });
});
