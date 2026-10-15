'use strict';
const { seedPackages } = require('./env');

const PUBLIC_FIELDS = ['id', 'name', 'description', 'family', 'booth', 'print_allowance', 'duration_hours', 'price_eur', 'is_featured', 'sort_order'];

function publicShape(p) {
  const o = { booth: 'classique' };
  for (const k of PUBLIC_FIELDS) if (p[k] !== undefined && p[k] !== null && p[k] !== '') o[k] = p[k];
  return o;
}

/**
 * Formules actives. Source : base de données si elle contient des formules, sinon le fichier
 * de configuration versionné (config/packages.json). Une seule source de vérité côté serveur.
 */
async function loadActivePackages(store) {
  let rows = [];
  if (store) {
    try { rows = await store.listPackages({ activeOnly: true }); } catch { rows = []; }
  }
  if (!rows.length) rows = seedPackages().packages.filter((p) => p.is_active);
  return rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

module.exports = { loadActivePackages, publicShape };
