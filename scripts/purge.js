#!/usr/bin/env node
'use strict';
// Purge manuelle : node scripts/purge.js <mois>   (utilise la même configuration de stockage que l'API)
const { getBackend } = require('../lib/store');
(async () => {
  const months = parseInt(process.argv[2] || process.env.RETENTION_MONTHS || '', 10);
  if (!months) { console.error('Indiquez la durée de conservation en mois (à valider avec le client).'); process.exit(1); }
  const { store, reason } = getBackend();
  if (!store) { console.error('Stockage non configuré :', reason); process.exit(1); }
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
  console.log(await store.purgeOlderThan(cutoff.toISOString()));
})();
