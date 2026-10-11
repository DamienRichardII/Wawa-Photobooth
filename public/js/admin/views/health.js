import { el } from '../../lib/dom.js';
import { errorText } from '../api.js';
import { loadHealth } from '../store.js';

export async function render(box) {
  box.replaceChildren(el('p', { class: 'empty', text: 'Vérification…' }));
  let d; try { d = await loadHealth(); } catch (e) { box.replaceChildren(el('p', { class: 'error-text', text: errorText(e) })); return; }
  const ko = d.checks.filter((c) => !c.ok && c.id !== 'hosted').length;
  box.replaceChildren(
    el('div', { class: `alert-box${ko ? '' : ''}` }, [el('span', { text: ko ? `${ko} point(s) à configurer avant la mise en production.` : 'Tous les contrôles sont au vert.' })]),
    el('ul', { class: 'health', style: false }, d.checks.map((c) => el('li', { 'data-ok': String(c.ok) }, [el('span', { class: 'dot', 'aria-hidden': 'true', text: c.ok ? '✓' : '!' }), el('div', {}, [el('strong', { text: c.label }), el('small', { text: `${c.ok ? 'OK' : 'À faire'} — ${c.detail}` })])]))),
    el('p', { class: 'muted', text: 'Cet écran n’affiche jamais de secret : uniquement l’état de chaque réglage. Les valeurs se configurent dans les variables d’environnement de l’hébergeur (voir README).' }));
  box.querySelector('.health').style.padding = '0';
}
