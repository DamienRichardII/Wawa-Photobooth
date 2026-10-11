import { $ } from '../lib/dom.js';
import { api, session, ApiError } from './api.js';

const MSG = {
  invalid_credentials: 'Identifiants ou code incorrects.',
  locked: 'Trop d’échecs : accès verrouillé 15 minutes.',
  rate_limited: 'Trop de tentatives : réessayez dans quelques minutes.',
  admin_not_configured: 'Le serveur n’est pas encore configuré pour l’administration.',
  auth_unavailable: 'Service d’authentification momentanément indisponible. Réessayez.',
  mfa_already_enrolled: 'La double authentification est déjà activée : saisissez votre code.'
};
const msgOf = (e) => (e instanceof ApiError ? MSG[e.code] || (e.status === 0 ? 'Serveur injoignable.' : 'Connexion impossible.') : 'Erreur inattendue.');
const show = (node, text) => { node.textContent = text || ''; node.hidden = !text; };

export function initLogin(startApp) {
  const form = $('#login-form'); const enroll = $('#enroll-form');
  const err = $('[data-login-error]'); const eerr = $('[data-enroll-error]');
  let creds = null; let factorId = null;
  const busy = (f, b) => { f.querySelectorAll('button').forEach((x) => { x.disabled = b; }); };
  const done = (d) => { session.csrf = d.csrf; session.email = d.email; form.reset(); enroll.reset(); creds = null; factorId = null; enroll.hidden = true; form.hidden = false; startApp(d.email); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, '');
    const fd = new FormData(form);
    const body = { email: fd.get('email'), password: fd.get('password'), code: fd.get('code') };
    busy(form, true);
    try { done(await api('login', { method: 'POST', body })); }
    catch (ex) {
      if (ex instanceof ApiError && ex.code === 'mfa_enrollment_required') {
        try {
          const f = await api('mfa-enroll', { method: 'POST', body: { email: body.email, password: body.password } });
          creds = { email: body.email, password: body.password }; factorId = f.factor_id;
          $('[data-enroll-secret]').textContent = f.secret || '';
          const qr = $('[data-enroll-qr]'); if (f.qr) { qr.src = f.qr; qr.hidden = false; } else { qr.hidden = true; qr.removeAttribute('src'); }
          form.hidden = true; enroll.hidden = false; $('input[name=code]', enroll).focus();
        } catch (e2) { show(err, msgOf(e2)); }
      } else show(err, msgOf(ex));
    } finally { busy(form, false); }
  });

  enroll.addEventListener('submit', async (e) => {
    e.preventDefault(); show(eerr, '');
    busy(enroll, true);
    try { done(await api('mfa-verify', { method: 'POST', body: { ...creds, factor_id: factorId, code: new FormData(enroll).get('code') } })); }
    catch (ex) { show(eerr, msgOf(ex)); } finally { busy(enroll, false); }
  });
  $('[data-enroll-cancel]').addEventListener('click', () => { creds = null; factorId = null; enroll.reset(); enroll.hidden = true; form.hidden = false; });
}

initLogin.refreshConfig = async function () {
  const w = $('[data-config-warning]');
  try {
    const r = await fetch('/api/admin/status-check', { credentials: 'same-origin' });
    const d = await r.json();
    if (d && d.configured === false) { w.textContent = `Configuration serveur incomplète : ${(d.missing || []).join(', ')}.`; w.hidden = false; return; }
  } catch { /* */ }
  w.hidden = true;
};
