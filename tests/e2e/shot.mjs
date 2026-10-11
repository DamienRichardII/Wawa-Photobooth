// Capture d'écran rapide : node tests/e2e/shot.mjs <chemin> <largeur> <fichier> [fullPage=1]
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const [,, path = '/', width = '1312', out = 'tests/e2e/out/shot.png', full = '1'] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +width, height: +width < 700 ? 800 : 900 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto('http://localhost:3100' + path, { waitUntil: 'networkidle' });
// révèle les éléments animés pour la capture complète
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); } window.scrollTo({ top: 0, behavior: 'instant' }); });
await p.waitForTimeout(1200);
await p.screenshot({ path: out, fullPage: full === '1' });
console.log('console:', errs.length ? errs : 'aucune erreur');
await b.close();
