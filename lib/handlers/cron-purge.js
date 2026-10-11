'use strict';
const { send, HttpError, wrap } = require('../http');
const { siteConfig } = require('../env');
const { getBackend } = require('../store');
const { safeEqual } = require('../crypto');

// Purge automatique selon la durée de conservation (RETENTION_MONTHS ou config/site.json › legal.retentionMonths).
// Tant que la durée n'est pas validée par Wawa Photobooth, rien n'est supprimé.
module.exports = wrap('cron-purge', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new HttpError(401, 'unauthorized');
  const months = parseInt(process.env.RETENTION_MONTHS || '', 10) || siteConfig().legal.retentionMonths;
  if (!months) return send(res, 200, { skipped: true, reason: 'retention_not_configured' });
  const { store } = getBackend();
  if (!store) throw new HttpError(503, 'service_not_configured');
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
  const out = await store.purgeOlderThan(cutoff.toISOString());
  send(res, 200, { purged: out, cutoff: cutoff.toISOString() });
});
