#!/usr/bin/env node
'use strict';
// Génère public/robots.txt et public/sitemap.xml. Le sitemap n'est produit que si `siteUrl` est renseigné
// dans config/site.json (URL absolue obligatoire) : on n'invente pas de domaine.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(root, 'config/site.json'), 'utf8'));
const base = (site.siteUrl || process.env.SITE_URL || '').replace(/\/+$/, '');
const pages = ['', 'prestations/', 'galerie/', 'reservation/', 'a-propos/', 'contact/', 'faq/', 'mentions-legales/', 'politique-de-confidentialite/', 'cookies/'];
const pub = path.join(root, 'public');
let robots = 'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n';
if (base) {
  if (!/^https:\/\/[^/\s]+$/.test(base)) { console.error('siteUrl invalide (https://domaine attendu)'); process.exit(1); }
  const day = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(pub, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${base}/${p}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  robots += `Sitemap: ${base}/sitemap.xml\n`;
  console.log('sitemap.xml généré pour', base);
} else {
  try { fs.unlinkSync(path.join(pub, 'sitemap.xml')); } catch { /* */ }
  console.log('siteUrl non renseigné : sitemap.xml non généré (à faire une fois le domaine connu).');
}
fs.writeFileSync(path.join(pub, 'robots.txt'), robots);
