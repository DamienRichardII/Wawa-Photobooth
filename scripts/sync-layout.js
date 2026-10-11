#!/usr/bin/env node
'use strict';
/**
 * Synchronise l'en-tête, le pied de page et les blocs générés dans toutes les pages de public/.
 * Les pages restent du HTML statique : ce script ne fait que remplacer le contenu entre marqueurs
 *   <!--@header-->…<!--@/header-->   <!--@footer-->…<!--@/footer-->   <!--@include:nom-->…<!--@/include-->
 * Usage : npm run layout   (à relancer après modification de config/site.json ou config/packages.json)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
const packagesCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'packages.json'), 'utf8'));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="/media/icons/sprite.svg#i-${name}"/></svg>`;
const TODO = '<mark class="todo">à renseigner</mark>';

const NAV = [
  ['accueil', '/', 'Accueil'],
  ['formules', '/prestations/', 'Nos formules'],
  ['galerie', '/galerie/', 'Galerie'],
  ['reservation', '/reservation/', 'Réservation'],
  ['a-propos', '/a-propos/', 'À propos'],
  ['contact', '/contact/', 'Contact']
];
const SOCIAL = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['snapchat', 'Snapchat']];

function socialList(cls) {
  const items = SOCIAL.filter(([k]) => site.social[k]).map(([k, label]) =>
    `<li><a href="${esc(site.social[k])}" target="_blank" rel="noopener noreferrer" aria-label="${label} (s’ouvre dans un nouvel onglet)">${ico(k)}</a></li>`);
  return items.length ? `<ul class="social ${cls}">${items.join('')}</ul>` : '';
}

function header(active) {
  const links = NAV.map(([key, href, label]) => `<li><a href="${href}"${key === active ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  return `<a class="skip-link" href="#main">Aller au contenu principal</a>
<header class="site-header" data-header>
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="WAWA PHOTOBOOTH — accueil"><img src="/media/img/logo-embleme-clair.webp" width="760" height="635" alt="WAWA PHOTOBOOTH"></a>
    <nav id="primary-nav" class="nav" aria-label="Navigation principale">
      <ul>${links}</ul>
      <div class="nav-cta"><a class="btn btn--gold" href="/reservation/">Réserver maintenant</a></div>
    </nav>
    <div class="header-actions">
      ${socialList('')}
      <a class="btn btn--outline btn--sm" href="/reservation/">Réserver</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Ouvrir le menu">${ico('menu', 'icon i-open')}${ico('x', 'icon i-close')}</button>
    </div>
  </div>
</header>`;
}

function footer() {
  const c = site.contact;
  const contact = [];
  if (c.email) contact.push(`<li>${ico('mail')} <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`);
  if (c.phone) contact.push(`<li>${ico('phone')} <a href="tel:${esc(String(c.phone).replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a></li>`);
  contact.push('<li><a href="/contact/">Nous écrire</a></li>');
  contact.push('<li><a href="/reservation/">Faire une demande de réservation</a></li>');
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <img src="/media/img/logo-complet-or.webp" width="900" height="894" alt="WAWA PHOTOBOOTH — Capturez l’instant, gardez l’émotion." loading="lazy">
      ${socialList('footer-social')}
    </div>
    <div><h2>Navigation</h2><ul>${NAV.map(([, h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>
    <div><h2>Informations</h2><ul><li><a href="/faq/">Questions fréquentes</a></li><li><a href="/mentions-legales/">Mentions légales</a></li><li><a href="/politique-de-confidentialite/">Politique de confidentialité</a></li><li><a href="/cookies/">Gestion des cookies</a></li></ul></div>
    <div><h2>Contact</h2><ul>${contact.join('')}</ul></div>
  </div>
  <div class="container footer-bottom"><span>© ${year} WAWA PHOTOBOOTH. Tous droits réservés.</span><span>Capturez l’instant, gardez l’émotion.</span></div>
</footer>`;
}

// ── Formules mises en avant (pré-rendu depuis config/packages.json) ───────────────
const euro = (n) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}€`;
const dur = (h) => { const w = Math.floor(h); const m = Math.round((h - w) * 60); return `${w}h${m ? String(m).padStart(2, '0') : ''} de présence`; };
function featuredPackages() {
  const list = packagesCfg.packages.filter((p) => p.is_active && p.is_featured).sort((a, b) => a.sort_order - b.sort_order).slice(0, 4);
  if (!list.length) return '<li class="notice">Formules en cours de configuration.</li>';
  return list.map((p, i) => {
    const feats = [p.print_allowance, p.duration_hours ? dur(p.duration_hours) : null, (packagesCfg.included || [])[0]].filter(Boolean);
    return `<li class="pkg-card card reveal d${i + 1}"><div class="pkg-card__body"><h3>${esc(p.name)}</h3><p class="pkg-price">${euro(p.price_eur)}</p><ul class="pkg-feats">${feats.map((f) => `<li>${ico('check')}<span>${esc(f)}</span></li>`).join('')}</ul><a class="btn btn--brown" href="/reservation/?formule=${encodeURIComponent(p.id)}">Choisir cette formule</a></div></li>`;
  }).join('');
}

// ── Gabarits (pages légales) avec jetons {{chemin.valeur}} ──────────────────────
function tokens(tpl) {
  const ctx = { site, legal: site.legal, contact: site.contact, retention: site.legal.retentionMonths };
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, p) => {
    const v = p.split('.').reduce((o, k) => (o ? o[k] : undefined), ctx);
    return v === null || v === undefined || v === '' ? TODO : esc(v);
  }).replace(/\{\{\?legalNotice\}\}/g, '');
}
function partial(name) {
  const f = path.join(__dirname, 'partials', `${name}.html`);
  if (!fs.existsSync(f)) throw new Error(`Partiel introuvable : ${name}`);
  const legalNotice = site.legal.validated === true ? '' :
    `<div class="notice notice--warn" role="note">${ico('alert')}<p><strong>Document préparé à partir des informations disponibles — à compléter et à faire valider par WAWA PHOTOBOOTH (et un conseil juridique) avant mise en ligne.</strong> Les mentions « à renseigner » signalent des informations non fournies.</p></div>`;
  return tokens(fs.readFileSync(f, 'utf8')).replace('<!--@legal-notice-->', legalNotice);
}
function familyPackages(family) {
  const list = packagesCfg.packages.filter((p) => p.is_active && p.family === family).sort((a, b) => a.sort_order - b.sort_order);
  if (!list.length) return '<li class="notice">Formules en cours de configuration.</li>';
  return list.map((p, i) => {
    const feats = [p.print_allowance, p.duration_hours ? dur(p.duration_hours) : null, (packagesCfg.included || [])[0]].filter(Boolean);
    return `<li class="pkg-card card reveal d${(i % 4) + 1}"><div class="pkg-card__body"><h3>${esc(p.name)}</h3><p class="pkg-price">${euro(p.price_eur)}</p><ul class="pkg-feats">${feats.map((f) => `<li>${ico('check')}<span>${esc(f)}</span></li>`).join('')}</ul><a class="btn btn--brown" href="/reservation/?formule=${encodeURIComponent(p.id)}">Choisir cette formule</a></div></li>`;
  }).join('');
}
function optionsBlock() {
  return (packagesCfg.options || []).map((o) => `<article class="option-card card reveal"><div class="option-card__icon">${ico('magnet')}</div><div class="option-card__body"><p class="eyebrow">${esc(o.tag || 'En option')}</p><h3>${esc(o.name)}</h3><ul class="pkg-feats">${(o.features || []).map((f) => `<li>${ico('check')}<span>${esc(f)}</span></li>`).join('')}</ul></div><div class="option-card__price"><span>À partir de</span><strong>${euro(o.price_from_eur)}</strong></div></article>`).join('');
}
const INCLUDES = { 'featured-packages': featuredPackages, 'packages-numerique': () => familyPackages('numerique'), 'packages-tirages': () => familyPackages('tirages'), options: optionsBlock };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(PUBLIC)) {
  const src = fs.readFileSync(file, 'utf8');
  const nav = (/<body[^>]*data-nav="([\w-]+)"/.exec(src) || [])[1] || '';
  let out = src
    .replace(/<!--@header-->[\s\S]*?<!--@\/header-->/, () => `<!--@header-->\n${header(nav)}\n<!--@/header-->`)
    .replace(/<!--@footer-->[\s\S]*?<!--@\/footer-->/, () => `<!--@footer-->\n${footer()}\n<!--@/footer-->`)
    .replace(/<!--@include:([\w-]+)-->[\s\S]*?<!--@\/include-->/g, (_, name) => `<!--@include:${name}-->\n${(INCLUDES[name] ? INCLUDES[name]() : partial(name))}\n<!--@/include-->`);
  if (out !== src) { fs.writeFileSync(file, out); changed++; }
}
console.log(`Mise en page synchronisée (${changed} fichier(s) modifié(s)).`);
