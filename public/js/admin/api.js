import { DEMO } from './config.js';
// Accès à l'API d'administration. Cookie de session HttpOnly + en-tête CSRF pour toute écriture.
export const session = { csrf: '', email: '' };
let onLost = () => {};
export const setOnSessionLost = (f) => { onLost = f; };

export class ApiError extends Error {
  constructor(status, code, data) { super(code || 'error'); this.status = status; this.code = code; this.data = data; }
}

export async function api(action, { method = 'GET', body, query } = {}) {
  if (DEMO) { const { demoApi } = await import('./demo.js'); return demoApi(action, { method, body, query }); }
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')) : '';
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' || action === 'export') headers['x-csrf-token'] = session.csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(`/api/admin/${action}${qs}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch { throw new ApiError(0, 'network'); }
  const isCsv = (res.headers.get('content-type') || '').includes('text/csv');
  const data = isCsv ? await res.blob() : await res.json().catch(() => null);
  if (res.status === 401 && !['login', 'mfa-enroll', 'mfa-verify'].includes(action)) { onLost(); throw new ApiError(401, 'unauthorized'); }
  if (!res.ok) throw new ApiError(res.status, data && data.error, data);
  return data;
}

export function errorText(e) {
  if (!(e instanceof ApiError)) return 'Erreur inattendue.';
  return ({ 0: 'Serveur injoignable : vérifiez votre connexion.', 403: 'Action refusée (session expirée ?) : reconnectez-vous.', 404: 'Élément introuvable.', 409: 'Conflit : action déjà effectuée.', 422: 'Données invalides.', 429: 'Trop de tentatives : réessayez plus tard.', 503: 'Service non configuré.' })[e.status] || 'Erreur serveur.';
}
