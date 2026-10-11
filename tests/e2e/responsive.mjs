import { createRequire } from 'module'; const { chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright');
const base = process.env.BASE || 'http://localhost:3100';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pages = ['/', '/prestations/', '/galerie/', '/reservation/', '/a-propos/', '/contact/', '/faq/', '/mentions-legales/', '/politique-de-confidentialite/', '/cookies/', '/inexistante'];
let bad = 0;
for (const w of [375, 768, 1280]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/40[14]|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  for (const u of pages) {
    await p.goto(base + u, { waitUntil: 'load' }); await p.waitForTimeout(400);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, imgs: [...document.images].filter((i) => i.getAttribute('alt') === null).length, h1: document.querySelectorAll('h1').length }));
    if (o.sw > o.cw + 1 || o.imgs || o.h1 !== 1) { bad++; console.log('PROBLEME', w, u, o); }
  }
  if (errs.length) { bad++; console.log('erreurs JS', w, errs); }
}
console.log(bad ? 'problèmes: ' + bad : 'OK : aucun débordement horizontal, un h1 par page, images avec alt, aucune erreur JS');
await b.close();
