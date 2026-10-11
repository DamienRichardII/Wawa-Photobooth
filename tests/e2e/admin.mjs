import { createRequire } from 'module'; const { chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright');
const base = process.env.BASE || 'http://localhost:3200';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/401/.test(m.text()) && errs.push(m.text()));
// 1. créer une demande réelle via l'API publique
await p.goto(base + '/reservation/');
const idk = crypto.randomUUID();
const r = await p.evaluate(async (idk) => (await fetch('/api/booking-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'mariage', event_type_other: null, event_address: '1 rue Test, Paris', address_place_id: null, installation_type: 'indoor', photobooth_requested: false, photobooth_package_id: null, couple_first_names: 'A et B', event_date: '2027-06-12', start_time: '18:00', guest_count: 80, first_name: 'Awa', last_name: 'Test', email: 'awa@example.com', phone: '+33600000000', idempotency_key: idk, started_at: Date.now() - 9000, website: '' }) })).status, idk);
console.log('booking POST status', r);
// 2. admin
await p.goto(base + '/admin/');
await p.fill('[name=email]', 'admin@test.local'); await p.fill('[name=password]', 'mauvais'); await p.click('#login-form button');
await p.waitForSelector('[data-login-error]:not([hidden])'); console.log('bad login:', await p.innerText('[data-login-error]'));
await p.fill('[name=password]', 'MotDePasseTest-2026!'); await p.click('#login-form button');
await p.waitForSelector('[data-view=dash]:not([hidden])'); await p.waitForSelector('tr.row-click');
console.log('rows:', await p.locator('tr.row-click').count(), '|', (await p.locator('tr.row-click').first().innerText()).replace(/\s+/g, ' '));
await p.locator('tr.row-click').first().click(); await p.waitForSelector('.adm-detail dl');
console.log('detail has email:', (await p.innerText('.adm-detail')).includes('awa@example.com'));
await p.selectOption('.adm-detail select', 'a-contacter'); await p.click('text=Enregistrer le statut');
await p.waitForSelector('.badge[data-s="a-contacter"]'); console.log('status changed ok');
await p.click('text=Exporter CSV'); await p.waitForTimeout(500); console.log('flash:', await p.innerText('[data-flash]'));
await p.click('[data-tabs] >> text=Formules'); await p.waitForSelector('.adm-notice button'); await p.click('text=Importer la grille en base'); await p.waitForSelector('text=Modifier >> nth=0');
console.log('packages in db rows:', await p.locator('tbody tr').count());
await p.click('[data-tabs] >> text=Journal'); await p.waitForSelector('tbody tr'); console.log('audit rows:', await p.locator('tbody tr').count());
await p.screenshot({ path: '/tmp/admin.png' });
await p.click('[data-logout]'); await p.waitForSelector('[data-view=login]:not([hidden])'); console.log('logout ok');
console.log('JS errors:', errs); await b.close();
