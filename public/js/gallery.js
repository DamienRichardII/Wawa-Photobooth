import { $, $$, el } from './lib/dom.js';

const list = $('[data-gallery]');
const lb = $('[data-lightbox]');
const mediaBox = $('[data-lb-media]', lb);
const cap = $('[data-lb-cap]', lb);
const tiles = () => $$('li:not([hidden]) .tile', list);
let current = -1; let opener = null;

// Filtres
$$('[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
  const f = chip.dataset.filter;
  $$('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  $$('li', list).forEach((li) => { li.hidden = f !== 'all' && li.dataset.kind !== f; });
}));

function show(i) {
  const t = tiles(); if (!t.length) return;
  current = (i + t.length) % t.length;
  const b = t[current];
  mediaBox.replaceChildren();
  let node;
  if (b.dataset.kind === 'video') {
    node = el('video', { class: 'lightbox__media', controls: true, playsinline: true, autoplay: true, loop: true, muted: true, poster: b.dataset.poster, src: b.dataset.src, 'aria-label': b.dataset.caption });
    node.muted = true;
  } else node = el('img', { class: 'lightbox__media', src: b.dataset.src, alt: b.dataset.caption });
  mediaBox.append(node);
  cap.textContent = b.dataset.caption;
}
function open(btn) {
  opener = btn; lb.hidden = false; lb.classList.add('is-open'); document.body.classList.add('lb-open');
  show(tiles().indexOf(btn)); $('[data-lb-close]', lb).focus();
}
function close() {
  lb.classList.remove('is-open'); lb.hidden = true; document.body.classList.remove('lb-open');
  mediaBox.replaceChildren(); if (opener) opener.focus();
}
list.addEventListener('click', (e) => { const b = e.target.closest('.tile'); if (b) open(b); });
$('[data-lb-close]', lb).addEventListener('click', close);
$('[data-lb-prev]', lb).addEventListener('click', () => show(current - 1));
$('[data-lb-next]', lb).addEventListener('click', () => show(current + 1));
lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
addEventListener('keydown', (e) => {
  if (lb.hidden) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') show(current - 1);
  else if (e.key === 'ArrowRight') show(current + 1);
  else if (e.key === 'Tab') { // piège de focus simple
    const f = $$('button, video[controls]', lb); const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
