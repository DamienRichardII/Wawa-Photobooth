import { $, $$ } from './lib/dom.js';
import { loadConfig } from './lib/api.js';
import { packageCard } from './lib/packages.js';
import './hero.js';

// Les 4 formules mises en avant sont pré-rendues en HTML (config/packages.json) ; on les actualise depuis l'API
// (base de données administrable) lorsqu'elle répond, sans jamais inventer de contenu.
const grid = $('[data-featured-packages]');
if (grid) {
  loadConfig().then((cfg) => {
    const featured = cfg.packages.filter((p) => p.is_featured).slice(0, 4);
    if (!featured.length) return;
    grid.replaceChildren(...featured.map((p, i) => packageCard(p, { index: i, included: cfg.included })));
    window.__observeReveals && window.__observeReveals(grid);
  }).catch(() => { /* on conserve le rendu statique */ });
}
