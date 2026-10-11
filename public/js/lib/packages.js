import { el, icon } from './dom.js';

const MEDIA = [
  { slug: 'miroir-fleurs-blanches', alt: 'Photobooth WAWA avec composition de fleurs blanches et crème' },
  { slug: 'miroir-logo-led', alt: 'Photobooth WAWA avec cadre lumineux LED' },
  { slug: 'miroir-ecran-fete', alt: 'Photobooth WAWA lors d’une soirée avec écran d’accueil festif' },
  { slug: 'miroir-fleurs-jaunes', alt: 'Photobooth WAWA décoré de fleurs jaunes et blanches' }
];

export const euro = (n) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}€`;
export function durationLabel(h) {
  if (h === undefined || h === null) return null;
  const whole = Math.floor(h); const min = Math.round((h - whole) * 60);
  return `${whole}h${min ? String(min).padStart(2, '0') : ''} de présence`;
}
export const FAMILY_LABEL = { numerique: 'Photo numérique', tirages: 'Tirages illimités', autre: 'Autres formules' };

/** Carte de formule : n'affiche QUE les propriétés renseignées (jamais de valeur inventée). */
export function packageCard(p, { index = 0, included = [], cta = true } = {}) {
  const m = MEDIA[index % MEDIA.length];
  const feats = [p.print_allowance, durationLabel(p.duration_hours), ...included.slice(0, 1)].filter(Boolean);
  const li = el('li', { class: 'pkg-card card reveal', style: false }, [
    el('div', { class: 'pkg-card__media' }, [
      el('img', { src: `/media/img/${m.slug}-poster.webp`, alt: m.alt, width: 576, height: 1024, loading: 'lazy', decoding: 'async' }),
      p.print_allowance === 'Tirages illimités' ? el('span', { class: 'pkg-card__tag', text: 'Tirages illimités' }) : null
    ]),
    el('div', { class: 'pkg-card__body' }, [
      el('h3', { text: p.name }),
      p.price_eur !== undefined ? el('p', { class: 'pkg-price', text: euro(p.price_eur) }) : null,
      p.description ? el('p', { text: p.description }) : null,
      el('ul', { class: 'pkg-feats' }, feats.map((f) => el('li', {}, [icon('check'), el('span', { text: f })]))),
      cta ? el('a', { class: 'btn btn--brown', href: `/reservation/?formule=${encodeURIComponent(p.id)}` }, ['Choisir cette formule']) : null
    ])
  ]);
  li.style.setProperty('--d', `${(index % 4) * 90}ms`);
  return li;
}
