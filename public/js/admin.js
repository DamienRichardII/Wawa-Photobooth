import { $, el } from './lib/dom.js';

// Interface d'administration. Toutes les données sont rendues via textContent (el()) : jamais d'innerHTML.
const API = '/api/admin/';
let csrf = ''; let me = '';
const view = (n) => document.querySelectorAll('[data-view]').forEach((s) => { s.hidden = s.dataset.view !== n; });
const flash = (msg, bad) => { const f = $('[data-flash]'); f.textContent = msg || ''; f.hidden = !msg; f.style.borderLeftColor = bad ? '#9b1c1c' : '#c9973f'; if (msg) setTimeout(() => { f.hidden = true; }, 5000); };

async function api(action, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' || action === 'export') headers['x-csrf-token'] = csrf;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(API + action + qs, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch { throw Object.assign(new Error('network'), { status: 0 }); }
  if (res.status === 401) { showLogin(); throw Object.assign(new Error('auth'), { status: 401 }); }
  const isCsv = (res.headers.get('content-type') || '').includes('text/csv');
  const data = isCsv ? await res.blob() : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error((data && data.error) || 'error'), { status: res.status, data });
  return data;
}
const errMsg = (e) => e.status === 0 ? 'Serveur injoignable.' : e.status === 403 ? 'Session expirée : reconnectez-vous.' : e.status === 429 ? 'Trop de tentatives : réessayez plus tard.' : e.status === 422 ? 'Données invalides.' : e.status === 503 ? 'Service non configuré.' : 'Erreur serveur.';

const STATUS_LABEL = { nouvelle: 'Nouvelle', 'a-contacter': 'À contacter', 'devis-envoye': 'Devis envoyé', confirmee: 'Confirmée', annulee: 'Annulée' };
const dt = (s) => { try { return new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s || ''; } };
const badge = (s) => el('span', { class: 'badge', 'data-s': s, text: STATUS_LABEL[s] || s });
const field = (label, input) => el('label', {}, [label, input]);
const option = (v, t, sel) => el('option', { value: v, text: t, selected: sel });

// ── Connexion ────────────────────────────────────────────────────────────────
async function showLogin() {
  view('login');
  try {
    const c = await (await fetch(API + 'status-check', { credentials: 'same-origin' })).json();
    const w = $('[data-config-warning]');
    if (c && c.configured === false) { w.textContent = 'Administration non configurée. Variables manquantes : ' + (c.missing || []).join(', ') + '.'; w.hidden = false; }
  } catch { /* */ }
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const err = $('[data-login-error]'); err.hidden = true;
  const btn = $('button', f); btn.disabled = true;
  try {
    const r = await api('login', { method: 'POST', body: { email: f.email.value, password: f.password.value, code: f.code.value } });
    csrf = r.csrf; me = r.email; f.password.value = ''; f.code.value = ''; start();
  } catch (x) {
    err.textContent = x.status === 401 ? 'Identifiants ou code incorrects.' : x.status === 503 ? 'Administration non configurée sur ce serveur.' : x.message === 'locked' ? 'Compte temporairement verrouillé (15 min).' : errMsg(x);
    err.hidden = false;
  } finally { btn.disabled = false; }
});
$('[data-logout]').addEventListener('click', async () => { try { await api('logout', { method: 'POST', body: {} }); } catch { /* */ } csrf = ''; showLogin(); });

// ── Navigation ───────────────────────────────────────────────────────────────
const TABS = [['requests', 'Demandes'], ['messages', 'Messages'], ['packages', 'Formules'], ['audit', 'Journal']];
let tab = 'requests';
function start() {
  view('dash'); $('[data-who]').textContent = me;
  $('[data-tabs]').replaceChildren(...TABS.map(([id, label]) => el('button', { type: 'button', 'aria-current': id === tab ? 'page' : false, onclick: () => { tab = id; start(); } }, [label])));
  ({ requests: renderRequests, messages: renderMessages, packages: renderPackages, audit: renderAudit })[tab]();
}
const panel = () => $('[data-panel]');
const empty = (t) => el('p', { class: 'muted', text: t });

// ── Demandes ─────────────────────────────────────────────────────────────────
async function renderRequests(filters = {}) {
  panel().replaceChildren(empty('Chargement…'));
  let data;
  try { data = await api('requests', { query: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }); } catch (e) { if (e.status !== 401) panel().replaceChildren(empty(errMsg(e))); return; }
  const status = el('select', { name: 'status' }, [option('', 'Tous les statuts'), ...data.statuses.map((s) => option(s, STATUS_LABEL[s], filters.status === s))]);
  const q = el('input', { type: 'search', value: filters.q || '', placeholder: 'Référence, nom, email…' });
  const from = el('input', { type: 'date', value: filters.from || '' }); const to = el('input', { type: 'date', value: filters.to || '' });
  const apply = () => renderRequests({ status: status.value, q: q.value.trim(), from: from.value, to: to.value });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  const bar = el('div', { class: 'adm-bar' }, [field('Statut', status), field('Recherche', q), field('Du', from), field('Au', to),
    el('button', { class: 'btn btn--gold btn--sm', type: 'button', onclick: apply }, ['Filtrer']),
    el('button', { class: 'btn btn--outline btn--sm', type: 'button', onclick: exportCsv }, ['Exporter CSV'])]);
  const rows = data.items.map((r) => el('tr', { class: 'row-click', tabindex: 0, onclick: () => openRequest(r.id), onkeydown: (e) => { if (e.key === 'Enter') openRequest(r.id); } }, [
    el('td', { text: dt(r.created_at) }), el('td', { text: r.reference }), el('td', { text: r.name || '—' }),
    el('td', { text: `${r.event_type || ''} · ${r.event_date || ''}` }), el('td', { text: r.package_snapshot ? r.package_snapshot.name : (r.photobooth_requested ? '—' : 'Sans photobooth') }), el('td', {}, [badge(r.status)])]));
  panel().replaceChildren(bar, el('p', { class: 'muted', text: `${data.total} demande(s)` }),
    el('div', { class: 'adm-table-wrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Reçue', 'Référence', 'Client', 'Événement', 'Formule', 'Statut'].map((h) => el('th', { text: h })))]), el('tbody', {}, rows.length ? rows : [el('tr', {}, [el('td', { colspan: 6, text: 'Aucune demande.' })])])])]),
    el('div', { 'data-detail': '' }));
}
async function exportCsv() {
  try {
    const blob = await api('export');
    const a = el('a', { href: URL.createObjectURL(blob), download: 'demandes-wawa.csv' }); document.body.append(a); a.click(); a.remove();
    flash('Export généré (action journalisée).');
  } catch (e) { flash(errMsg(e), true); }
}
async function openRequest(id) {
  const box = $('[data-detail]'); box.replaceChildren(empty('Chargement…'));
  let d; try { d = await api('request', { query: { id } }); } catch (e) { box.replaceChildren(empty(errMsg(e))); return; }
  const r = d.request; const p = r.package_snapshot;
  const rows = [['Référence', r.reference], ['Reçue', dt(r.created_at)], ['Occasion', r.event_type + (r.event_type_other ? ` (${r.event_type_other})` : '')], ['Adresse', r.event_address], ['Installation', r.installation_type === 'outdoor' ? 'Extérieur (règles de sécurité à vérifier)' : 'Intérieur'],
    ['Photobooth', r.photobooth_requested ? 'Oui' : 'Non'], ['Formule (au moment de la demande)', p ? `${p.name}${p.price_eur != null ? ' · ' + p.price_eur + '€' : ''}` : '—'], ['Prénoms', r.couple_first_names], ['Date / heure', `${r.event_date} ${r.start_time}`], ['Invités', r.guest_count],
    ['Nom', r.name], ['Email', r.email], ['Téléphone', r.phone], ['Consentement marketing', r.marketing_consent ? 'Oui' : 'Non'], ['Notification équipe', r.notify_status], ['Accusé client', r.ack_status]].filter(([, v]) => v !== null && v !== undefined && v !== '');
  const sel = el('select', {}, Object.entries(STATUS_LABEL).map(([v, t]) => option(v, t, v === r.status)));
  const save = el('button', { class: 'btn btn--gold btn--sm', type: 'button', onclick: async () => {
    try { await api('status', { method: 'POST', body: { id: r.id, status: sel.value } }); flash('Statut mis à jour.'); renderRequests(); } catch (e) { flash(errMsg(e), true); } } }, ['Enregistrer le statut']);
  const del = el('button', { class: 'btn--danger', type: 'button', onclick: async () => {
    if (!window.confirm('Supprimer définitivement cette demande ? Action irréversible.')) return;
    try { await api('delete', { method: 'POST', body: { id: r.id } }); flash('Demande supprimée.'); renderRequests(); } catch (e) { flash(errMsg(e), true); } } }, ['Supprimer (RGPD)']);
  box.replaceChildren(el('div', { class: 'adm-detail' }, [el('h2', { text: r.reference }), r.decrypt_error ? el('p', { class: 'adm-error', text: 'Données personnelles illisibles (clé de chiffrement différente ?).' }) : null,
    el('dl', {}, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })])),
    el('div', { class: 'adm-actions' }, [field('Statut', sel), save, del]),
    el('h3', { text: 'Historique' }), d.events.length ? el('ul', {}, d.events.map((x) => el('li', { text: `${dt(x.created_at)} — ${x.type || x.event_type || ''} ${x.detail ? JSON.stringify(x.detail) : ''}` }))) : empty('Aucun événement.')]));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Messages ─────────────────────────────────────────────────────────────────
async function renderMessages() {
  let d; try { d = await api('messages'); } catch (e) { if (e.status !== 401) panel().replaceChildren(empty(errMsg(e))); return; }
  panel().replaceChildren(d.items.length ? el('div', {}, d.items.map((m) => el('article', { class: 'adm-detail' }, [
    el('h3', { text: `${m.reference} · ${dt(m.created_at)}` }),
    el('dl', {}, [['Nom', m.name], ['Email', m.email], ['Téléphone', m.phone], ['Sujet', m.subject]].filter(([, v]) => v).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
    el('p', { text: m.message || (m.decrypt_error ? '(illisible)' : '') }),
    el('button', { class: 'btn btn--outline btn--sm', type: 'button', onclick: async () => { try { await api('message-status', { method: 'POST', body: { id: m.id, status: m.status === 'traite' ? 'nouveau' : 'traite' } }); renderMessages(); } catch (e) { flash(errMsg(e), true); } } }, [m.status === 'traite' ? 'Marquer comme nouveau' : 'Marquer comme traité'])]))) : empty('Aucun message.'));
}

// ── Formules (configuration administrable) ──────────────────────────────────
async function renderPackages() {
  let d; try { d = await api('packages'); } catch (e) { if (e.status !== 401) panel().replaceChildren(empty(errMsg(e))); return; }
  const top = [];
  if (d.source === 'config') top.push(el('div', { class: 'adm-notice' }, [
    el('p', { text: 'Aucune formule en base : le site affiche actuellement la grille du fichier de configuration (à valider par le client). Importez-la pour pouvoir la modifier ici.' }),
    el('button', { class: 'btn btn--gold btn--sm', type: 'button', onclick: async () => { try { await api('seed-packages', { method: 'POST', body: {} }); flash('Formules importées.'); renderPackages(); } catch (e) { flash(errMsg(e), true); } } }, ['Importer la grille en base'])]));
  const form = (p = {}) => {
    const f = {
      id: el('input', { value: p.id || '', required: true, readonly: Boolean(p.id) }), name: el('input', { value: p.name || '' }),
      family: el('select', {}, ['numerique', 'tirages', 'autre'].map((v) => option(v, v, p.family === v))),
      price: el('input', { type: 'number', min: 0, step: '0.01', value: p.price_eur ?? '' }), dur: el('input', { type: 'number', min: 0, step: '0.5', value: p.duration_hours ?? '' }),
      prints: el('input', { value: p.print_allowance || '' }), desc: el('input', { value: p.description || '' }), sort: el('input', { type: 'number', value: p.sort_order ?? 0 }),
      active: el('input', { type: 'checkbox', checked: p.is_active !== false }), feat: el('input', { type: 'checkbox', checked: Boolean(p.is_featured) })
    };
    const msg = el('p', { class: 'adm-error', role: 'alert', hidden: true });
    const node = el('form', { class: 'adm-detail', novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); msg.hidden = true;
      const num = (i) => (i.value === '' ? null : Number(i.value));
      try { await api('package', { method: 'POST', body: { id: f.id.value.trim(), name: f.name.value, family: f.family.value, price_eur: num(f.price), duration_hours: num(f.dur), print_allowance: f.prints.value || null, description: f.desc.value || null, sort_order: parseInt(f.sort.value || '0', 10), is_active: f.active.checked, is_featured: f.feat.checked } });
        flash('Formule enregistrée.'); renderPackages(); }
      catch (x) { msg.textContent = x.data && x.data.fields ? Object.values(x.data.fields).join(' ') : errMsg(x); msg.hidden = false; } } }, [
      el('h3', { text: p.id ? `Modifier « ${p.name} »` : 'Nouvelle formule' }),
      el('div', { class: 'adm-grid' }, [field('Identifiant', f.id), field('Nom', f.name), field('Famille', f.family), field('Prix (€) — laisser vide si non validé', f.price), field('Durée (h)', f.dur), field('Tirages', f.prints), field('Description', f.desc), field('Ordre', f.sort)]),
      el('p', {}, [el('label', {}, [f.active, ' Active (visible sur le site)']), ' ', el('label', {}, [f.feat, ' Mise en avant (accueil)'])]), msg,
      el('button', { class: 'btn btn--gold btn--sm', type: 'submit' }, ['Enregistrer'])]);
    return node;
  };
  const holder = el('div');
  const rows = d.packages.map((p) => el('tr', {}, [el('td', { text: p.name }), el('td', { text: p.family }), el('td', { text: p.price_eur != null ? p.price_eur + '€' : '—' }), el('td', { text: p.duration_hours != null ? p.duration_hours + ' h' : '—' }), el('td', { text: p.is_active === false ? 'Inactive' : 'Active' }),
    el('td', {}, [d.source === 'database' ? el('button', { class: 'btn btn--outline btn--sm', type: 'button', onclick: () => holder.replaceChildren(form(p)) }, ['Modifier']) : null])]));
  panel().replaceChildren(...top, el('div', { class: 'adm-table-wrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Nom', 'Famille', 'Prix', 'Durée', 'État', ''].map((h) => el('th', { text: h })))]), el('tbody', {}, rows)])]),
    el('p', {}, [el('button', { class: 'btn btn--gold btn--sm', type: 'button', onclick: () => holder.replaceChildren(form()) }, ['Ajouter une formule'])]), holder);
}

// ── Journal ──────────────────────────────────────────────────────────────────
async function renderAudit() {
  let d; try { d = await api('audit'); } catch (e) { if (e.status !== 401) panel().replaceChildren(empty(errMsg(e))); return; }
  panel().replaceChildren(el('div', { class: 'adm-table-wrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Date', 'Acteur', 'Action', 'Détail'].map((h) => el('th', { text: h })))]), el('tbody', {}, d.items.map((a) => el('tr', {}, [el('td', { text: dt(a.created_at) }), el('td', { text: a.actor || '—' }), el('td', { text: a.action }), el('td', { text: a.detail ? JSON.stringify(a.detail) : '' })])))])]));
}

// ── Démarrage : session existante ? ─────────────────────────────────────────
(async () => {
  try { const r = await fetch(API + 'me', { credentials: 'same-origin' }); if (r.ok) { const d = await r.json(); csrf = d.csrf; me = d.email; return start(); } } catch { /* */ }
  showLogin();
})();
