import { el, icon } from '../lib/dom.js';

/**
 * Saisie d'adresse avec suggestions (service public de géocodage configuré dans config/site.json).
 * Confidentialité : seul le texte saisi est envoyé, sans cookie ni en-tête Referer.
 * Accessibilité : motif WAI-ARIA « combobox » avec liste.
 */
export function initAddress({ input, list, endpoint, onSelect, onClear, onAvailability }) {
  let items = []; let active = -1; let ctrl = null; let timer = null; let selected = null; let seq = 0;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const paint = () => {
    list.replaceChildren(...items.map((it, i) => el('li', { class: 'combo__opt', role: 'option', id: `addr-opt-${i}`, 'aria-selected': String(i === active) }, [icon('pin'), el('span', { text: it.label })])));
    const open = items.length > 0;
    list.hidden = !open; input.setAttribute('aria-expanded', String(open));
    if (active >= 0) input.setAttribute('aria-activedescendant', `addr-opt-${active}`); else input.removeAttribute('aria-activedescendant');
  };
  function choose(i) {
    const it = items[i]; if (!it) return;
    selected = it.label; input.value = it.label; close(); items = [];
    onSelect({ label: it.label, id: it.id });
  }
  async function search(q) {
    if (!endpoint) return;
    if (ctrl) ctrl.abort();
    ctrl = new AbortController(); const mine = ++seq;
    try {
      const url = new URL(endpoint);
      url.searchParams.set('q', q); url.searchParams.set('limit', '5'); url.searchParams.set('autocomplete', '1'); url.searchParams.set('index', 'address');
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('http');
      const data = await res.json();
      if (mine !== seq) return;
      items = (data.features || []).map((f) => ({ label: String((f.properties && (f.properties.label || f.properties.fulltext)) || ''), id: (f.properties && f.properties.id) || null })).filter((x) => x.label).slice(0, 5);
      active = -1; paint(); onAvailability(true);
    } catch (e) {
      if (e.name === 'AbortError') return;
      items = []; paint(); onAvailability(false);
    }
  }

  input.addEventListener('input', () => {
    if (selected !== null && input.value !== selected) { selected = null; onClear(); }
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { items = []; paint(); return; }
    timer = setTimeout(() => search(q), 260);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', (e) => { e.preventDefault(); const li = e.target.closest('.combo__opt'); if (li) choose(Number(li.id.split('-').pop())); });
  return { markSelected(label) { selected = label; }, reset() { selected = null; items = []; paint(); } };
}
