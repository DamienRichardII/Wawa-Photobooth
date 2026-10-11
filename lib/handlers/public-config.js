'use strict';
const { send, HttpError, wrap } = require('../http');
const { siteConfig, seedPackages } = require('../env');
const { getBackend } = require('../store');
const { loadActivePackages, publicShape } = require('../packages');

module.exports = wrap('packages', async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
  const { store } = getBackend();
  const packages = (await loadActivePackages(store)).map(publicShape);
  const seed = seedPackages();
  const site = siteConfig();
  send(res, 200, {
    packages,
    options: seed.options || [],
    included: seed.included || [],
    bookingAvailable: Boolean(store),
    config: {
      marketingConsentEnabled: site.booking.marketingConsentEnabled === true,
      henneAskCoupleNames: site.booking.henneAskCoupleNames === true,
      minLeadDays: site.booking.minLeadDays || 0,
      addressAutocomplete: site.booking.addressAutocomplete || null,
      contact: { email: site.contact.email, phone: site.contact.phone }
    }
  }, { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' });
});
