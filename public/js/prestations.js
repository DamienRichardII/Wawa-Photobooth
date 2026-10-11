import { $ } from './lib/dom.js';
import { loadConfig } from './lib/api.js';
import { packageCard, FAMILY_LABEL } from './lib/packages.js';

// Rendu statique issu de config/packages.json ; remplacé par la configuration administrable (API) lorsqu'elle répond.
loadConfig().then((cfg) => {
  for (const family of ['numerique', 'tirages']) {
    const grid = $(`[data-family="${family}"]`);
    if (!grid) continue;
    const list = cfg.packages.filter((p) => p.family === family);
    if (!list.length) continue;
    grid.replaceChildren(...list.map((p, i) => packageCard(p, { index: i, included: cfg.included })));
    window.__observeReveals && window.__observeReveals(grid);
  }
  const other = cfg.packages.filter((p) => !['numerique', 'tirages'].includes(p.family));
  const holder = $('[data-family="autre"]');
  if (holder && other.length) { holder.hidden = false; holder.replaceChildren(...other.map((p, i) => packageCard(p, { index: i, included: cfg.included }))); }
  void FAMILY_LABEL;
}).catch(() => { /* rendu statique conservé */ });
