import { $, $$ } from './lib/dom.js';

// ── En-tête : état « scrollé » ──────────────────────────────────────────────
const header = $('[data-header]');
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
}

// ── Menu mobile ─────────────────────────────────────────────────────────────
const toggle = $('.menu-toggle');
const nav = $('#primary-nav');
if (toggle && nav) {
  const close = (focus = false) => { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Ouvrir le menu'); if (focus) toggle.focus(); };
  const open = () => { nav.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Fermer le menu'); };
  toggle.addEventListener('click', () => (toggle.getAttribute('aria-expanded') === 'true' ? close() : open()));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) close(true); });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  matchMedia('(min-width: 981px)').addEventListener('change', (e) => { if (e.matches) close(); });
}

// ── Apparition au défilement (IntersectionObserver) ─────────────────────────
export function observeReveals(root = document) {
  const targets = $$('.reveal:not(.is-visible), .section-title:not(.is-visible)', root);
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('is-visible')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  targets.forEach((t) => io.observe(t));
}
observeReveals();
window.__observeReveals = observeReveals; // utilisé par les modules qui injectent du contenu
