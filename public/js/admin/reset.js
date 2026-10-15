// Mot de passe oublié : demande du lien, puis choix du nouveau mot de passe (jeton lu dans le fragment d'URL, jamais journalisé).
const $ = (s, r = document) => r.querySelector(s);
const post = async (action, body) => {
  let res; try { res = await fetch(`/api/admin/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }); } catch { return { ok: false, code: 'network' }; }
  const d = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, code: d && d.error };
};
const show = (n, t) => { n.textContent = t || ''; n.hidden = !t; };
const busy = (f, b) => f.querySelectorAll('button[type=submit]').forEach((x) => { x.disabled = b; });

const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('t');
if (token) history.replaceState(null, '', location.pathname); // retire le jeton de la barre d'adresse

const ask = $('#ask-form'); const set = $('#set-form');
if (token) { ask.hidden = true; set.hidden = false; }

document.querySelectorAll('[data-pw-toggle]').forEach((eye) => eye.addEventListener('click', () => {
  const on = eye.closest('form').querySelector('input[name=password]').type === 'password';
  eye.closest('form').querySelectorAll('.pw input').forEach((i) => { i.type = on ? 'text' : 'password'; });
  eye.setAttribute('aria-pressed', String(on)); eye.setAttribute('aria-label', on ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
}));

ask.addEventListener('submit', async (e) => {
  e.preventDefault(); show($('[data-ask-error]'), ''); $('[data-ask-ok]').hidden = true;
  busy(ask, true);
  const r = await post('password-reset', { email: new FormData(ask).get('email') });
  busy(ask, false);
  if (r.ok) { $('[data-ask-ok]').hidden = false; return; }
  show($('[data-ask-error]'), r.code === 'rate_limited' ? 'Trop de demandes : réessayez dans quelques minutes.' : r.code === 'email_not_configured' ? 'L’envoi d’e-mails n’est pas encore configuré sur le serveur.' : 'Demande impossible pour le moment. Réessayez.');
});

set.addEventListener('submit', async (e) => {
  e.preventDefault(); const err = $('[data-set-error]'); show(err, '');
  const fd = new FormData(set); const pw = String(fd.get('password')); 
  if (pw.length < 12) return show(err, 'Le mot de passe doit contenir au moins 12 caractères.');
  if (pw !== fd.get('confirm')) return show(err, 'Les deux mots de passe ne sont pas identiques.');
  busy(set, true);
  const r = await post('password-reset-confirm', { token, password: pw });
  busy(set, false);
  if (r.ok) { set.hidden = true; $('[data-done]').hidden = false; return; }
  show(err, r.code === 'invalid_token' ? 'Ce lien est invalide ou expiré. Demandez-en un nouveau.' : r.code === 'weak_password' ? 'Mot de passe refusé : choisissez-en un plus long ou plus complexe.' : r.code === 'rate_limited' ? 'Trop de tentatives : réessayez dans quelques minutes.' : 'Enregistrement impossible. Réessayez.');
});
