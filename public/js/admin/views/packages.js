import { el, icon } from '../../lib/dom.js';
import { api, errorText } from '../api.js';
import { toast } from '../util.js';
import { loadConfig } from '../../lib/api.js';

const BOOTH = { classique: 'Photobooth miroir', bois: 'Photobooth boisé (nouveau)' };
const FAMILY = { numerique: 'Photo numérique', tirages: 'Tirages illimités', autre: 'Autre' };
export async function render(box, params, rerender) {
  box.replaceChildren(el('p', { class: 'empty', text: 'Chargement…' }));
  let d; try { d = await api('packages'); } catch (e) { box.replaceChildren(el('p', { class: 'error-text', text: errorText(e) })); return; }
  const fromDb = d.source === 'database';
  const save = async (p, okMsg) => { try { await api('package', { method: 'POST', body: p }); toast(okMsg, 'good'); rerender(); } catch (e) { toast(e.data && e.data.fields ? Object.values(e.data.fields).join(' ') : errorText(e), 'bad'); return false; } return true; };

  function openForm(p = {}) {
    const dlg = document.querySelector('[data-confirm]');
    const f = {
      id: el('input', { value: p.id || '', required: true, readonly: Boolean(p.id), pattern: '[a-z0-9][a-z0-9_-]{0,63}' }), name: el('input', { value: p.name || '', maxlength: 80 }),
      booth: el('select', {}, Object.entries(BOOTH).map(([v, t]) => el('option', { value: v, selected: (p.booth || 'classique') === v, text: t }))),
      family: el('select', {}, Object.entries(FAMILY).map(([v, t]) => el('option', { value: v, selected: (p.family || 'numerique') === v, text: t }))),
      price: el('input', { type: 'number', min: 0, step: '0.01', value: p.price_eur ?? '' }), dur: el('input', { type: 'number', min: 0.5, step: '0.5', value: p.duration_hours ?? '' }),
      prints: el('input', { value: p.print_allowance || '', maxlength: 60 }), desc: el('input', { value: p.description || '', maxlength: 300 }), sort: el('input', { type: 'number', value: p.sort_order ?? 0 }),
      active: el('input', { type: 'checkbox', checked: p.is_active !== false }), feat: el('input', { type: 'checkbox', checked: Boolean(p.is_featured) })
    };
    const msg = el('p', { class: 'error-text', role: 'alert', hidden: true });
    const num = (i) => (i.value === '' ? null : Number(i.value));
    const form = el('form', { method: 'dialog', novalidate: true }, [el('h2', { text: p.id ? `Modifier « ${p.name} »` : 'Nouvelle formule' }),
      el('div', { class: 'form-grid' }, [el('label', {}, ['Identifiant (a-z, 0-9, - _)', f.id]), el('label', {}, ['Nom', f.name]), el('label', {}, ['Modèle de Photobooth', f.booth]), el('label', {}, ['Famille', f.family]), el('label', {}, ['Prix (€) — vide si non validé', f.price]), el('label', {}, ['Durée (h)', f.dur]), el('label', {}, ['Tirages', f.prints]), el('label', {}, ['Description', f.desc]), el('label', {}, ['Ordre d’affichage', f.sort])]),
      el('label', { class: 'check' }, [f.active, 'Active (visible dans le parcours de réservation)']), el('label', { class: 'check' }, [f.feat, 'Mise en avant sur l’accueil']), msg,
      el('div', { class: 'confirm__btns' }, [el('button', { class: 'abtn', type: 'button', onclick: () => dlg.close() }, ['Annuler']), el('button', { class: 'abtn abtn--gold', type: 'submit', value: 'ok' }, ['Enregistrer'])])]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.hidden = true;
      const ok = await save({ id: f.id.value.trim(), name: f.name.value, booth: f.booth.value, family: f.family.value, price_eur: num(f.price), duration_hours: num(f.dur), print_allowance: f.prints.value || null, description: f.desc.value || null, sort_order: parseInt(f.sort.value || '0', 10), is_active: f.active.checked, is_featured: f.feat.checked }, 'Formule enregistrée');
      if (ok) dlg.close();
    });
    dlg.replaceChildren(form); dlg.classList.add('wide'); dlg.returnValue = ''; dlg.showModal(); (p.id ? f.name : f.id).focus();
  }

  const top = [];
  if (!fromDb) top.push(el('div', { class: 'alert-box' }, [icon('info'), el('div', {}, [el('p', { class: 'mb-0', text: 'Aucune formule en base : le site affiche la grille du fichier de configuration (non validée par le client). Importez-la pour pouvoir la modifier ici.' }),
    el('button', { class: 'abtn abtn--gold abtn--sm', type: 'button', style: false, onclick: async () => { try { await api('seed-packages', { method: 'POST', body: {} }); toast('Formules importées', 'good'); rerender(); } catch (e) { toast(errorText(e), 'bad'); } } }, ['Importer la grille en base'])])]));
  const rows = d.packages.map((p) => el('tr', {}, [el('td', {}, [el('strong', { text: p.name }), el('span', { class: 'cell-sub', text: p.id })]), el('td', { text: `${p.booth === 'bois' ? 'Boisé' : 'Classique'} · ${FAMILY[p.family] || p.family}` }), el('td', { text: p.price_eur != null ? `${p.price_eur} €` : '—' }), el('td', { text: p.duration_hours != null ? `${p.duration_hours} h` : '—' }),
    el('td', {}, [fromDb ? el('label', { class: 'check' }, [el('input', { type: 'checkbox', checked: p.is_active !== false, 'aria-label': `Formule ${p.name} active`, onchange: (e) => save({ ...p, is_active: e.target.checked }, e.target.checked ? 'Formule activée' : 'Formule désactivée') }), p.is_active !== false ? 'Active' : 'Inactive']) : (p.is_active !== false ? 'Active' : 'Inactive')]),
    el('td', {}, [fromDb ? el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => openForm(p) }, [icon('pencil'), 'Modifier']) : null])]));
  box.replaceChildren(...top, el('div', { class: 'toolbar' }, [el('p', { class: 'muted grow', text: `${d.packages.length} formule(s) — ${fromDb ? 'gérées en base de données' : 'issues du fichier de configuration'}.` }), el('button', { class: 'abtn abtn--gold abtn--sm', type: 'button', disabled: !fromDb, title: fromDb ? '' : 'Importez d’abord la grille en base', onclick: () => openForm() }, ['Ajouter une formule'])]),
    el('div', { class: 'table-wrap' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Formule', 'Modèle · famille', 'Prix', 'Durée', 'État', ''].map((h) => el('th', { scope: 'col', text: h })))]), el('tbody', {}, rows)])]),
    el('p', { class: 'muted', text: 'Un prix laissé vide n’est jamais affiché sur le site. Les changements sont visibles dans le parcours de réservation sans nouveau déploiement.' }));
}
