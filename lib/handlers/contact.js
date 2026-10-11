'use strict';
const { send, HttpError, readJson, ipHash, checkOrigin, wrap } = require('../http');
const { getBackend } = require('../store');
const { validateContact } = require('../validate');
const { encrypt, newReference } = require('../crypto');
const rl = require('../ratelimit');
const mailer = require('../mailer');

module.exports = wrap('contact', async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  checkOrigin(req);
  const { store, key, reason } = getBackend();
  if (!store) throw new HttpError(503, 'service_not_configured', { reason });

  const ip = ipHash(req);
  const lim = rl.hit(`contact:${ip}`, 4, 10 * 60 * 1000);
  if (!lim.ok) throw new HttpError(429, 'rate_limited', { retryAfter: lim.retryAfter });

  const v = validateContact(await readJson(req, 8 * 1024));
  if (!v.ok) {
    if (Object.keys(v.errors).some((k) => k.startsWith('_'))) throw new HttpError(400, 'invalid_request');
    throw new HttpError(422, 'validation', { fields: v.errors });
  }
  const d = v.value;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  if ((await store.countRecentByIpHash('contact_messages', ip, since)) >= 10) throw new HttpError(429, 'rate_limited', { retryAfter: 3600 });

  let row = null;
  for (let i = 0; i < 4 && !row; i++) {
    const reference = newReference('MSG');
    try {
      row = await store.createContactMessage({
        reference, ip_hash: ip, notify_status: 'pending',
        pii_encrypted: encrypt(JSON.stringify({ name: d.name, email: d.email, phone: d.phone, message: d.message }), key, reference)
      });
    } catch (e) { if (e.code === '23505' || e.status === 409) continue; throw e; }
  }
  if (!row) throw new HttpError(500, 'internal_error');
  await mailer.notifyTeamContact({ reference: row.reference });
  send(res, 201, { reference: row.reference, received: true });
});
