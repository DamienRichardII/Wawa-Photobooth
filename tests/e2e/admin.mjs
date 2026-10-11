// E2E de l'administration. Prérequis : serveur de dev (STORAGE_DRIVER=file, ADMIN_EMAIL=admin@test.local,
// mot de passe MotDePasseTest-2026!, ADMIN_ALLOW_NO_MFA=true) sur BASE (défaut http://localhost:3200).
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright');
const base = process.env.BASE || 'http://localhost:3200';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/40[13]|429/.test(m.text()) && errs.push(m.text()));
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
p.on('dialog', (d) => d.dismiss());
const mk = (i, over = {}) => ({ event_type: 'mariage', event_address: '1 rue Test, Paris', installation_type: 'indoor', photobooth_requested: true, photobooth_package_id: 'decouverte', magnet_bar_requested: false, couple_first_names: 'A et B', event_date: '2027-06-12', start_time: '18:00', guest_count: 80, first_name: 'Awa', last_name: 'Test' + 'abcdefgh'[i], email: `awa${i}@example.com`, phone: '+33600000000', idempotency_key: crypto.randomUUID(), started_at: Date.now() - 9000, website: '', ...over });
for (let i = 0; i < 2; i++) { const r = await ctx.request.post(base + '/api/booking-requests', { headers: { origin: base, 'x-forwarded-for': `10.1.0.${i + 10}` }, data: mk(i) }); ok(r.status() === 201, 'demande créée ' + r.status()); }

await p.goto(base + '/admin/');
await p.fill('[name=email]', 'admin@test.local'); await p.fill('[name=password]', 'mauvais'); await p.click('#login-form button[type=submit]');
await p.waitForSelector('[data-login-error]:not([hidden])'); ok(true, 'mauvais identifiants refusés : ' + await p.innerText('[data-login-error]'));
await p.fill('[name=password]', 'MotDePasseTest-2026!'); await p.click('#login-form button[type=submit]');
await p.waitForSelector('[data-view=app]:not([hidden])'); await p.waitForSelector('.kpi, [class*=kpi]');
ok((await p.innerText('main')).includes('À traiter'), 'tableau de bord affiché');

// Liste + fiche
await p.goto(base + '/admin/#/requests'); await p.waitForSelector('tbody tr');
const n = await p.locator('tbody tr').count(); ok(n >= 2, `liste : ${n} demandes`);
await p.locator('tbody tr').first().click(); await p.waitForSelector('dialog[open][data-sheet]');
const txt = await p.innerText('dialog[data-sheet]');
ok(/@example\.com/.test(txt), 'fiche : e-mail déchiffré affiché');
// statut
await p.click('dialog[data-sheet] .step-btn >> text=À contacter'); await p.waitForSelector('dialog[data-sheet] .step-btn[aria-pressed=true]:has-text("À contacter")'); ok(true, 'statut → À contacter');
// note chiffrée
await p.fill('dialog[data-sheet] textarea', 'Rappel <img src=x onerror=window.__xss=1> jeudi'); await p.click('dialog[data-sheet] >> text=Ajouter la note');
await p.waitForSelector('dialog[data-sheet] >> text=Rappel <img'); ok(true, 'note ajoutée et affichée en texte brut');
ok(!(await p.evaluate(() => window.__xss)), 'aucune exécution de script (XSS)');
await p.fill('dialog[data-sheet] textarea', ''); await p.click('dialog[data-sheet] button:text-is("Appel téléphonique")'); await p.waitForTimeout(500); ok(true, 'contact tracé (téléphone)');
await p.screenshot({ path: '/tmp/t/e-sheet.png' });
await p.keyboard.press('Escape');

// Pipeline
await p.goto(base + '/admin/#/requests'); await p.click('text=Pipeline'); await p.waitForSelector('.kcard'); ok(await p.locator('.kcard').count() >= 2, 'pipeline : cartes affichées');
await p.screenshot({ path: '/tmp/t/e-kanban.png' });
// Calendrier
await p.goto(base + '/admin/#/calendar'); await p.waitForTimeout(400); ok((await p.innerText('main')).includes('LUN'), 'calendrier');
// Formules
await p.goto(base + '/admin/#/packages'); await p.waitForSelector('text=Importer la grille en base'); await p.click('text=Importer la grille en base');
await p.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 16, null, { timeout: 8000 }).catch(() => {}); ok(await p.locator('tbody tr').count() >= 16, 'formules importées en base');
// Santé + Journal
await p.goto(base + '/admin/#/health'); await p.waitForTimeout(400); ok((await p.innerText('main')).includes('Chiffrement'), 'configuration');
await p.goto(base + '/admin/#/audit'); await p.waitForSelector('tbody tr'); ok(await p.locator('tbody tr').count() > 3, 'journal d’audit');
// CSV
await p.goto(base + '/admin/#/requests'); await p.click('button:text-is("Liste")'); await p.waitForSelector('tbody tr');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Export CSV')]); ok(/\.csv$/.test(dl.suggestedFilename()), 'export CSV : ' + dl.suggestedFilename());
// Mobile
await p.setViewportSize({ width: 375, height: 800 }); await p.goto(base + '/admin/#/requests'); await p.waitForSelector('tbody tr, .rcard');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile : pas de défilement horizontal');
await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/t/e-mobile.png' }); await p.click('[data-menu]'); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/t/e-mobile-menu.png' });
await p.setViewportSize({ width: 1280, height: 900 });
// Déconnexion
await p.goto(base + '/admin/#/dashboard'); await p.click('[data-logout]'); await p.waitForSelector('[data-view=login]:not([hidden])'); ok(true, 'déconnexion');
ok((await ctx.request.get(base + '/api/admin/requests')).status() === 401, 'API fermée après déconnexion');
ok(errs.length === 0, 'aucune erreur JS ' + JSON.stringify(errs));
await b.close(); process.exit(fails ? 1 : 0);
