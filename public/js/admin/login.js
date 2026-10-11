import { $ } from '../lib/dom.js';
import { api, session, ApiError } from './api.js';

const MSG = {
  invalid_credentials: 'Identifiant ou mot de passe incorrect.',
  locked: 'Trop d’échecs : accès verrouillé 15 minutes.',
  rate_limited: 'Trop de tentatives : réessayez dans quelques minutes.',
  admin_not_configured: 'Le serveur n’est pas encore configuré pour l’administration.',
  auth_unavailable: 'Service d’authentification momentanément indisponible. Réessayez.'
};
const msgOf = (e) => (e instanceof ApiError ? MSG[e.code] || (e.status === 0 ? 'Serveur injoignable.' : 'Connexion impossible.') : 'Erreur inattendue.');

export function initLogin(startApp) {
  const form = $('#login-form'); const err = $('[data-login-error]');
  const pw = $('input[name=password]', form); const eye = $('[data-pw-toggle]', form);
  eye.addEventListener('click', () => {
    const show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const fd = new FormData(form);
    form.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      const d = await api('login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      session.csrf = d.csrf; session.email = d.email; form.reset(); pw.type = 'password'; startApp(d.email);
    } catch (ex) { err.textContent = msgOf(ex); err.hidden = false; }
    finally { form.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
  });
}

initLogin.refreshConfig = async function () {
  const w = $('[data-config-warning]');
  try {
    const d = await (await fetch('/api/admin/status-check', { credentials: 'same-origin' })).json();
    if (d && d.configured === false) { w.textContent = `Configuration serveur incomplète : ${(d.missing || []).join(', ')}.`; w.hidden = false; return; }
  } catch { /* */ }
  w.hidden = true;
};
