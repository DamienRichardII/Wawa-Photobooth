import { $, $$ } from './lib/dom.js';
import { loadConfig } from './lib/api.js';
import { packageCard } from './lib/packages.js';

// Onglets « modèle de Photobooth »
const tabs = $$('[data-booth-tab]');
function selectTab(name, focus = false) {
  tabs.forEach((t) => { const on = t.dataset.boothTab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  $$('[data-booth-panel]').forEach((p) => { p.hidden = p.dataset.boothPanel !== name; });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.boothTab));
  t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.boothTab, true); } });
});

// Rendu statique issu de config/packages.json ; remplacé par la configuration administrable (API) lorsqu'elle répond.
loadConfig().then((cfg) => {
  for (const booth of ['bois', 'classique']) {
    for (const family of ['numerique', 'tirages']) {
      const grid = $(`[data-booth="${booth}"][data-family="${family}"]`);
      if (!grid) continue;
      const list = cfg.packages.filter((p) => (p.booth || 'classique') === booth && p.family === family);
      if (!list.length) continue;
      grid.replaceChildren(...list.map((p, i) => packageCard(p, { index: i, included: cfg.included })));
      window.__observeReveals && window.__observeReveals(grid);
    }
  }
  const other = cfg.packages.filter((p) => !['numerique', 'tirages'].includes(p.family));
  const holder = $('[data-family="autre"]');
  if (holder && other.length) { holder.hidden = false; holder.replaceChildren(...other.map((p, i) => packageCard(p, { index: i, included: cfg.included }))); }
}).catch(() => { /* rendu statique conservé */ });
