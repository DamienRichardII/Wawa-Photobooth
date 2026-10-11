'use strict';
// Lecture centralisée de la configuration. Aucune valeur secrète n'est écrite dans le code.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function isProduction() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}
// Le pilote « file » écrit en clair sur disque (chiffrement applicatif conservé) : développement local uniquement.
function isHosted() {
  return Boolean(process.env.VERCEL) || isProduction();
}

let siteCache = null;
function siteConfig() {
  if (!siteCache) siteCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
  return siteCache;
}
let seedCache = null;
function seedPackages() {
  if (!seedCache) seedCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'packages.json'), 'utf8'));
  return seedCache;
}

function intEnv(name, def) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : def;
}

module.exports = { ROOT, isProduction, isHosted, siteConfig, seedPackages, intEnv };
