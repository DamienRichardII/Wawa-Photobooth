import { el } from '../../lib/dom.js';
import { api, errorText } from '../api.js';
import { state, loadMessages } from '../store.js';
import { fmtDateTime, toast, tag } from '../util.js';

let showDone = false;
export async function render(box, params, rerender) {
  box.replaceChildren(el('p', { class: 'empty', text: 'Chargement…' }));
  let d; try { d = await loadMessages(); } catch (e) { box.replaceChildren(el('p', { class: 'error-text', text: errorText(e) })); return; }
  const items = d.items.filter((m) => showDone || m.status !== 'traite');
  const toggle = el('label', { class: 'check' }, [el('input', { type: 'checkbox', checked: showDone, onchange: (e) => { showDone = e.target.checked; rerender(); } }), 'Afficher les messages traités']);
  box.replaceChildren(el('div', { class: 'toolbar' }, [toggle, el('span', { class: 'muted', text: `${d.items.filter((m) => m.status !== 'traite').length} message(s) à traiter` })]),
    items.length ? el('div', { class: 'grid' }, items.map((m) => el('article', { class: 'card msg' }, [
      el('div', { class: 'msg__head' }, [el('h3', { text: m.name || 'Anonyme' }), tag(m.status === 'traite' ? 'Traité' : 'Nouveau', m.status === 'traite' ? 'good' : 'warn'), el('small', { class: 'muted', text: fmtDateTime(m.created_at) })]),
      el('p', { class: 'muted', text: [m.email, m.phone].filter(Boolean).join(' · ') }),
      el('p', { text: m.decrypt_error ? '(message illisible : clé de chiffrement différente ?)' : (m.message || '') }),
      el('div', { class: 'quick' }, [
        m.email ? el('a', { class: 'abtn abtn--sm', href: `mailto:${m.email}?subject=${encodeURIComponent('Votre message à WAWA PHOTOBOOTH')}` }, ['Répondre par email']) : null,
        m.phone ? el('a', { class: 'abtn abtn--sm', href: `tel:${String(m.phone).replace(/[^+\d]/g, '')}` }, ['Appeler']) : null,
        el('button', { class: 'abtn abtn--sm', type: 'button', onclick: async () => { try { await api('message-status', { method: 'POST', body: { id: m.id, status: m.status === 'traite' ? 'nouveau' : 'traite' } }); toast('Message mis à jour', 'good'); rerender(); } catch (e) { toast(errorText(e), 'bad'); } } }, [m.status === 'traite' ? 'Remettre en « nouveau »' : 'Marquer comme traité'])])]))) : el('p', { class: 'empty card', text: 'Aucun message à traiter.' }));
}
