'use strict';
// Authentification des administrateurs via Supabase Auth (GoTrue) — mot de passe + TOTP (MFA Supabase).
// Aucun jeton Supabase n'est conservé : chaque appel se ré-authentifie, la session admin est notre cookie signé.
// Clé utilisée : clé « publishable/anon » (publique par conception). La clé service_role n'est jamais utilisée ici.

const TIMEOUT_MS = 8000;

function cfg() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return { url, key, ok: /^https:\/\/[^/\s]+$/.test(url) && key.length > 20 };
}
const enabled = () => cfg().ok;

async function call(path, { method = 'POST', body, token } = {}) {
  const c = cfg();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${c.url}/auth/v1/${path}`, {
      method, signal: ctrl.signal,
      headers: { apikey: c.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null; try { data = await res.json(); } catch { /* */ }
    return { ok: res.ok, status: res.status, data };
  } catch { return { ok: false, status: 0, data: null }; } finally { clearTimeout(t); }
}

/** Connexion par mot de passe. Renvoie { user, token } ou { error }. */
async function passwordLogin(email, password) {
  const r = await call('token?grant_type=password', { body: { email, password } });
  if (r.status === 0 || r.status >= 500) return { error: 'unavailable' };
  if (!r.ok || !r.data || !r.data.access_token || !r.data.user) return { error: 'invalid' };
  const u = r.data.user;
  if (!u.email || String(u.email).toLowerCase() !== email.toLowerCase() || !u.email_confirmed_at) return { error: 'invalid' };
  const factors = (u.factors || []).filter((f) => f.factor_type === 'totp' && f.status === 'verified');
  return { user: { id: u.id, email: String(u.email).toLowerCase() }, token: r.data.access_token, factorId: factors[0] ? factors[0].id : null };
}

/** Vérifie un code TOTP pour le facteur vérifié de l'utilisateur. */
async function verifyTotp(token, factorId, code) {
  const ch = await call(`factors/${encodeURIComponent(factorId)}/challenge`, { token, body: {} });
  if (!ch.ok || !ch.data || !ch.data.id) return false;
  const v = await call(`factors/${encodeURIComponent(factorId)}/verify`, { token, body: { challenge_id: ch.data.id, code } });
  return v.ok;
}

/** Démarre l'enrôlement d'un facteur TOTP (non vérifié tant qu'un code correct n'a pas été saisi). */
async function enrollTotp(token) {
  const r = await call('factors', { token, body: { factor_type: 'totp', friendly_name: `wawa-${Date.now().toString(36)}`, issuer: 'WAWA PHOTOBOOTH' } });
  if (!r.ok || !r.data || !r.data.totp) return null;
  return { factor_id: r.data.id, secret: r.data.totp.secret, uri: r.data.totp.uri, qr: typeof r.data.totp.qr_code === 'string' && r.data.totp.qr_code.startsWith('data:image/svg+xml') ? r.data.totp.qr_code : null };
}

module.exports = { enabled, passwordLogin, verifyTotp, enrollTotp };
