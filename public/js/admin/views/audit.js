import { el } from '../../lib/dom.js';
import { api, errorText } from '../api.js';
import { fmtDateTime } from '../util.js';

const LABEL = { login_ok: 'Connexion réussie', login_failed: 'Échec de connexion', list_requests: 'Consultation de la liste des demandes', view_request: 'Consultation d’une demande', status_change: 'Changement de statut', export: 'Export CSV', list_messages: 'Consultation des messages', message_status: 'Statut d’un message', package_upsert: 'Formule enregistrée', packages_seeded: 'Formules importées', note_added: 'Note interne ajoutée', contact_logged: 'Contact tracé', delete_request: 'Demande supprimée', purge: 'Purge RGPD' };
export async function render(box) {
  box.replaceChildren(el('p', { class: 'empty', text: 'Chargement…' }));
  let d; try { d = await api('audit'); } catch (e) { box.replaceChildren(el('p', { class: 'error-text', text: errorText(e) })); return; }
  const detail = (x) => { if (!x) return ''; const o = { ...x }; return Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k} : ${v}`).join(' · '); };
  box.replaceChildren(el('p', { class: 'muted', text: 'Les 100 dernières actions d’administration (aucune donnée personnelle dans ce journal).' }),
    el('div', { class: 'table-wrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Date', 'Acteur', 'Action', 'Détail'].map((h) => el('th', { scope: 'col', text: h })))]),
      el('tbody', {}, d.items.map((a) => el('tr', {}, [el('td', { text: fmtDateTime(a.created_at) }), el('td', { text: a.actor || '—' }), el('td', { text: LABEL[a.action] || a.action }), el('td', { text: detail(a.detail) })])))])]));
}
