'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, isHosted } = require('../env');
const { parseKey } = require('../crypto');
const { createFileStore } = require('./file');
const { createSupabaseStore } = require('./supabase');

let cached; // { store, key, reason }

/**
 * Retourne { store, key } ou { store: null, reason } si le service n'est pas configuré.
 * Jamais de repli silencieux : sans configuration valide, l'API répond « non configuré ».
 */
function getBackend() {
  if (cached) return cached;
  const driver = (process.env.STORAGE_DRIVER || (process.env.SUPABASE_URL ? 'supabase' : '')).toLowerCase();
  let key = parseKey(process.env.DATA_ENCRYPTION_KEY);

  if (driver === 'supabase') {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) cached = { store: null, key: null, reason: 'supabase_env_missing' };
    else if (!key) cached = { store: null, key: null, reason: 'encryption_key_missing' };
    else cached = { store: createSupabaseStore({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY }), key };
  } else if (driver === 'file') {
    if (isHosted()) cached = { store: null, key: null, reason: 'file_driver_forbidden_in_production' };
    else {
      if (!key) { // clé de développement locale, générée une fois et ignorée par Git
        const kf = path.join(ROOT, '.data', 'dev.key');
        fs.mkdirSync(path.dirname(kf), { recursive: true });
        if (!fs.existsSync(kf)) fs.writeFileSync(kf, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
        key = parseKey(fs.readFileSync(kf, 'utf8').trim());
      }
      cached = { store: createFileStore(process.env.DEV_STORE_FILE || undefined), key };
    }
  } else cached = { store: null, key: null, reason: 'storage_not_configured' };
  return cached;
}
function resetBackend() { cached = undefined; }

module.exports = { getBackend, resetBackend };
