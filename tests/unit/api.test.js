'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resetBackend } = require('../../lib/store');
const rl = require('../../lib/ratelimit');
const c = require('../../lib/crypto');
const totp = require('../../lib/totp');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wawa-'));
const STORE_FILE = path.join(tmp, 'store.json');
const ENV_KEYS = ['STORAGE_DRIVER', 'DEV_STORE_FILE', 'SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOTP_SECRET', 'DATA_ENCRYPTION_KEY', 'MIN_FILL_MS', 'VERCEL', 'NODE_ENV', 'RESEND_API_KEY', 'NOTIFY_EMAIL_TO', 'CRON_SECRET', 'RETENTION_MONTHS', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'EMAIL_FROM', 'SITE_ORIGIN'];
function setEnv(o) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, o); resetBackend(); rl.reset(); }

const server = require('../../server');
let base;
test.before(async () => { await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const body = (over = {}) => ({
  event_type: 'mariage', event_address: '12 rue de la Paix, 75002 Paris', installation_type: 'indoor',
  photobooth_requested: true, photobooth_package_id: 'decouverte', magnet_bar_requested: false, couple_first_names: 'Aya et Sam',
  event_date: '2999-06-12'.replace('2999', String(new Date().getFullYear() + 1)), start_time: '18:00', guest_count: 120,
  first_name: 'Aya', last_name: 'Martin', email: 'aya.martin@example.com', phone: '+33600000000',
  started_at: Date.now() - 60000, website: '', idempotency_key: crypto.randomUUID(), ...over
});
const post = (p, b, headers = {}) => (rl.reset(), fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof b === 'string' ? b : JSON.stringify(b) }));

test('sans stockage configuré : 503 explicite, jamais de faux succès', async () => {
  setEnv({});
  const r = await post('/api/booking-requests', body());
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'service_not_configured');
  const p = await (await fetch(base + '/api/packages')).json();
  assert.equal(p.bookingAvailable, false);
  assert.equal(p.packages.length, 16);
  assert.equal(p.packages[0].id, 'decouverte');
  assert.equal(p.packages.find((x) => x.id === 'supreme').price_eur, 600);
  assert.equal((await post('/api/contact', { name: 'x' })).status, 503);
});

test('le pilote file est refusé en production/hébergement', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, VERCEL: '1' });
  const r = await post('/api/booking-requests', body());
  assert.equal(r.status, 503);
  assert.equal((await r.json()).reason, 'file_driver_forbidden_in_production');
});

test('parcours de demande : succès, chiffrement, idempotence', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50' });
  const b = body();
  const r = await post('/api/booking-requests', b);
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.match(j.reference, /^WAWA-/);
  assert.equal(j.ack_email_sent, false); // aucun e-mail configuré => pas de faux envoi
  const raw = fs.readFileSync(STORE_FILE, 'utf8');
  for (const secret of ['aya.martin@example.com', '+33600000000', 'Martin', 'rue de la Paix', 'Aya et Sam']) assert.ok(!raw.includes(secret), `donnée en clair : ${secret}`);
  const row = JSON.parse(raw).booking_requests[0];
  assert.equal(row.package_snapshot.price_eur, 150);
  assert.equal(row.ip_hash.length, 32);
  assert.equal(row.notify_status, 'not_configured');
  // renvoi identique
  const r2 = await post('/api/booking-requests', b);
  assert.equal(r2.status, 200);
  const j2 = await r2.json();
  assert.equal(j2.reference, j.reference);
  assert.ok(j2.duplicate);
  assert.equal(JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')).booking_requests.length, 1);
});

test('Photobooth = Non : formule obsolète ignorée', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50' });
  const r = await post('/api/booking-requests', body({ photobooth_requested: false, photobooth_package_id: 'evasion', idempotency_key: crypto.randomUUID() }));
  assert.equal(r.status, 201);
  const rows = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')).booking_requests;
  const last = rows[rows.length - 1];
  assert.equal(last.package_id, null);
  assert.equal(last.package_snapshot, null);
  assert.equal(last.photobooth_requested, false);
});

test('erreurs de validation et protections', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50' });
  let r = await post('/api/booking-requests', body({ email: 'nope', guest_count: 0 }));
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.ok(j.fields.email && j.fields.guest_count);
  r = await post('/api/booking-requests', body({ photobooth_package_id: 'prix-pirate' }));
  assert.equal(r.status, 422);
  assert.ok((await r.json()).fields.photobooth_package_id);
  assert.equal((await post('/api/booking-requests', body({ website: 'x' }))).status, 400);
  assert.equal((await post('/api/booking-requests', body({ started_at: Date.now() }))).status, 400);
  assert.equal((await post('/api/booking-requests', body({ price_eur: 1 }))).status, 400);
  assert.equal((await post('/api/booking-requests', body(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/booking-requests', '{"a":', {})).status, 400);
  assert.equal((await fetch(base + '/api/booking-requests', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
  assert.equal((await post('/api/booking-requests', 'x'.repeat(40000))).status, 413);
  assert.equal((await fetch(base + '/api/booking-requests')).status, 405);
});

test('limitation de débit : 429 après 5 envois', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50' });
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await fetch(base + '/api/booking-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body({ idempotency_key: crypto.randomUUID() })) })).status);
  assert.deepEqual(codes.slice(0, 5), [201, 201, 201, 201, 201]);
  assert.equal(codes[5], 429);
});

test('contact : enregistré chiffré', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50' });
  const r = await post('/api/contact', { name: 'Léa Durand', email: 'lea@example.com', message: 'Bonjour, quelles sont vos disponibilités ?', started_at: Date.now() - 60000, website: '' });
  assert.equal(r.status, 201);
  assert.match((await r.json()).reference, /^MSG-/);
  assert.ok(!fs.readFileSync(STORE_FILE, 'utf8').includes('lea@example.com'));
});

test('administration : authentification, TOTP à usage unique, CSRF, verrouillage, export sûr', async () => {
  const hash = await c.hashPassword('mot-de-passe-admin-solide');
  const secret = totp.generateSecret();
  const adminEnv = { STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50', SESSION_SECRET: 'x'.repeat(48), ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD_HASH: hash, ADMIN_TOTP_SECRET: secret };
  const getJson = (p, h = {}) => fetch(base + p, { headers: h });
  const code = () => totp.hotp(totp.base32Decode(secret), totp.stepOf());

  // non configuré
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE });
  let r = await post('/api/admin/login', { email: 'a', password: 'b' });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'admin_not_configured');

  setEnv(adminEnv);
  // pas de session
  assert.equal((await getJson('/api/admin/requests')).status, 401);
  // un dossier avec une adresse piégée pour l'export
  await post('/api/booking-requests', body({ event_address: '=HYPERLINK("http://evil","x")', idempotency_key: crypto.randomUUID() }));

  // mauvais mot de passe
  r = await post('/api/admin/login', { email: 'admin@example.com', password: 'faux', code: code() });
  assert.equal(r.status, 401);
  // sans TOTP
  r = await post('/api/admin/login', { email: 'admin@example.com', password: 'mot-de-passe-admin-solide', code: '' });
  assert.equal(r.status, 401);
  // bon identifiants + TOTP
  const good = code();
  r = await post('/api/admin/login', { email: 'admin@example.com', password: 'mot-de-passe-admin-solide', code: good });
  assert.equal(r.status, 200, 'login');
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const { csrf } = await r.json();
  const ck = cookie.split(';')[0];
  // rejeu du même code TOTP refusé
  r = await post('/api/admin/login', { email: 'admin@example.com', password: 'mot-de-passe-admin-solide', code: good });
  assert.equal(r.status, 401);

  const me = await (await getJson('/api/admin/me', { cookie: ck })).json();
  assert.equal(me.email, 'admin@example.com');
  const list = await (await getJson('/api/admin/requests', { cookie: ck })).json();
  assert.ok(list.total >= 1);
  const item = list.items[0];
  assert.ok(item.email && item.name && item.reference);
  const detail = await (await getJson('/api/admin/request?id=' + item.id, { cookie: ck })).json();
  assert.ok(detail.request.event_address);

  // changement de statut : CSRF obligatoire
  r = await post('/api/admin/status', { id: item.id, status: 'a-contacter' }, { cookie: ck });
  assert.equal(r.status, 403);
  r = await post('/api/admin/status', { id: item.id, status: 'inexistant' }, { cookie: ck, 'x-csrf-token': csrf });
  assert.equal(r.status, 422);
  r = await post('/api/admin/status', { id: item.id, status: 'a-contacter' }, { cookie: ck, 'x-csrf-token': csrf });
  assert.equal(r.status, 200);
  const d2 = await (await getJson('/api/admin/request?id=' + item.id, { cookie: ck })).json();
  assert.equal(d2.request.status, 'a-contacter');
  assert.ok(d2.events.some((e) => e.kind === 'status' && e.to_status === 'a-contacter'));
  // notes internes chiffrées + trace de contact
  r = await post('/api/admin/note', { id: item.id, text: 'Rappeler jeudi' }, { cookie: ck });
  assert.equal(r.status, 403, 'CSRF requis pour les notes');
  r = await post('/api/admin/note', { id: item.id, text: '' }, { cookie: ck, 'x-csrf-token': csrf });
  assert.equal(r.status, 422, 'note vide sans canal refusée');
  r = await post('/api/admin/note', { id: item.id, text: 'x', channel: 'pigeon' }, { cookie: ck, 'x-csrf-token': csrf });
  assert.equal(r.status, 422, 'canal inconnu refusé');
  r = await post('/api/admin/note', { id: item.id, text: 'Rappeler jeudi <b>soir</b>' }, { cookie: ck, 'x-csrf-token': csrf });
  assert.equal(r.status, 201);
  r = await post('/api/admin/note', { id: item.id, channel: 'phone' }, { cookie: ck, 'x-csrf-token': csrf });
  assert.equal(r.status, 201);
  const d3 = await (await getJson('/api/admin/request?id=' + item.id, { cookie: ck })).json();
  assert.ok(d3.events.some((e) => e.kind === 'note' && e.note === 'Rappeler jeudi <b>soir</b>'));
  assert.ok(d3.events.some((e) => e.kind === 'contact' && e.to_status === 'phone'));
  assert.ok(!fs.readFileSync(process.env.DEV_STORE_FILE, 'utf8').includes('Rappeler jeudi'), 'note jamais en clair dans le stockage');
  // état de la configuration : booléens, aucun secret
  const health = await (await getJson('/api/admin/health', { cookie: ck })).json();
  assert.ok(Array.isArray(health.checks) && health.checks.length >= 5);
  assert.ok(!JSON.stringify(health).includes(process.env.SESSION_SECRET));
  // origine étrangère refusée même avec CSRF
  r = await post('/api/admin/status', { id: item.id, status: 'confirmee' }, { cookie: ck, 'x-csrf-token': csrf, origin: 'https://evil.example' });
  assert.equal(r.status, 403);

  // export CSV sans injection de formule
  assert.equal((await getJson('/api/admin/export', { cookie: ck })).status, 403);
  const csv = await (await getJson('/api/admin/export', { cookie: ck, 'x-csrf-token': csrf })).text();
  assert.ok(csv.includes(`"'=HYPERLINK(`), 'formule neutralisée');
  assert.ok(!/(^|,)"=/m.test(csv));

  // cookie falsifié
  assert.equal((await getJson('/api/admin/me', { cookie: ck.slice(0, -3) + 'abc' })).status, 401);
  // déconnexion
  r = await post('/api/admin/logout', {}, { cookie: ck });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);

  // verrouillage après 5 échecs
  rl.reset();
  const raw = () => fetch(base + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'victime@example.com', password: 'x', code: '000000' }) });
  for (let i = 0; i < 5; i++) await raw();
  r = await raw();
  assert.equal(r.status, 429);
});

test('purge RGPD : désactivée tant que la durée n’est pas validée', async () => {
  setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, CRON_SECRET: 'cron-secret-value' });
  assert.equal((await fetch(base + '/api/cron-purge')).status, 401);
  const r = await fetch(base + '/api/cron-purge', { headers: { authorization: 'Bearer cron-secret-value' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).skipped, true);
});

test('en-têtes de sécurité (CSP) sur pages et API', async () => {
  setEnv({});
  const r = await fetch(base + '/api/packages');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('administration via Supabase Auth : identifiant + mot de passe, liste blanche', async () => {
  const realFetch = global.fetch;
  const users = { 'ok@example.com': 'pw-ok', 'intrus@example.com': 'pw-x' };
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://proj.supabase.co/auth/v1/')) return realFetch(url, init);
    const b = init.body ? JSON.parse(init.body) : {};
    if (u.includes('/token?grant_type=password') && users[b.email] === b.password) return { ok: true, status: 200, json: async () => ({ access_token: 't', user: { id: 'u', email: b.email, email_confirmed_at: '2026-01-01', factors: [] } }) };
    return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
  };
  try {
    setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, MIN_FILL_MS: '50', SESSION_SECRET: 'x'.repeat(48), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'k'.repeat(30) });
    fs.writeFileSync(STORE_FILE, JSON.stringify({ admin_users: [{ email: 'ok@example.com', role: 'admin' }] }));
    resetBackend();
    const sc = await (await fetch(base + '/api/admin/status-check')).json();
    assert.equal(sc.configured, true); assert.equal(sc.mode, 'supabase');
    for (const [email, password] of [['ok@example.com', 'faux'], ['intrus@example.com', 'pw-x'], ['inconnu@example.com', 'x']]) {
      const r = await post('/api/admin/login', { email, password });
      assert.equal(r.status, 401); assert.equal((await r.json()).error, 'invalid_credentials');
    }
    const r = await post('/api/admin/login', { email: 'OK@example.com', password: 'pw-ok' });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/admin/me', { headers: { cookie } })).status, 200);
    fs.writeFileSync(STORE_FILE, JSON.stringify({ admin_users: [] }));
    assert.equal((await fetch(base + '/api/admin/me', { headers: { cookie } })).status, 401);
  } finally { global.fetch = realFetch; }
});

test('mot de passe oublié : lien par e-mail, usage unique, liste blanche, réponse générique', async () => {
  const realFetch = global.fetch; const sent = []; const pwSet = []; let used = false;
  global.fetch = async (url, init = {}) => {
    const u = String(url); const j = (st, d) => ({ ok: st < 300, status: st, json: async () => d });
    if (u === 'https://api.resend.com/emails') { sent.push(JSON.parse(init.body)); return j(200, {}); }
    if (!u.startsWith('https://proj.supabase.co/auth/v1/')) return realFetch(url, init);
    const b = init.body ? JSON.parse(init.body) : {};
    if (u.endsWith('/admin/generate_link')) return j(200, { hashed_token: 'tok_' + b.email.replace(/\W/g, '') });
    if (u.endsWith('/verify')) { if (used || !b.token_hash.startsWith('tok_')) return j(400, {}); used = true; return j(200, { access_token: 'sess', user: { email: b.token_hash === 'tok_okexamplecom' ? 'ok@example.com' : 'intrus@example.com' } }); }
    if (u.endsWith('/user') && init.method === 'GET') return init.headers.Authorization === 'Bearer sess-supabase-link-0000' ? j(200, { email: 'ok@example.com' }) : j(401, {});
    if (u.endsWith('/user') && init.method === 'PUT') { pwSet.push(b.password); return j(200, {}); }
    return j(404, {});
  };
  try {
    setEnv({ STORAGE_DRIVER: 'file', DEV_STORE_FILE: STORE_FILE, SESSION_SECRET: 'x'.repeat(48), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'k'.repeat(30), SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40), RESEND_API_KEY: 'rk', EMAIL_FROM: 'a@b.fr', SITE_ORIGIN: 'https://site.example' });
    fs.writeFileSync(STORE_FILE, JSON.stringify({ admin_users: [{ email: 'ok@example.com', role: 'admin' }] }));
    resetBackend();
    // adresse inconnue : même réponse, aucun e-mail
    let r = await post('/api/admin/password-reset', { email: 'inconnu@example.com' });
    assert.equal(r.status, 200); assert.equal(sent.length, 0);
    r = await post('/api/admin/password-reset', { email: 'ok@example.com' });
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
    assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, ['ok@example.com']);
    assert.match(sent[0].text, /https:\/\/site\.example\/admin\/reset\/#t=tok_okexamplecom/);
    // mot de passe trop court / jeton invalide
    assert.equal((await post('/api/admin/password-reset-confirm', { token: 'tok_okexamplecom', password: 'court' })).status, 422);
    assert.equal((await post('/api/admin/password-reset-confirm', { token: 'zzzzzzzzzzzz!', password: 'un-mot-de-passe-long-1' })).status, 400);
    r = await post('/api/admin/password-reset-confirm', { token: 'tok_okexamplecom', password: 'un-mot-de-passe-long-1' });
    assert.equal(r.status, 200); assert.deepEqual(pwSet, ['un-mot-de-passe-long-1']);
    // lien déjà utilisé
    assert.equal((await post('/api/admin/password-reset-confirm', { token: 'tok_okexamplecom', password: 'un-autre-mot-de-passe-2' })).status, 400);
    // jeton valide mais compte hors liste blanche : refusé, mot de passe inchangé
    used = false;
    r = await post('/api/admin/password-reset-confirm', { token: 'tok_intrusexamplecom', password: 'un-mot-de-passe-long-3' });
    assert.equal(r.status, 400); assert.equal(pwSet.length, 1);
    // lien Supabase (redirection) : jeton de session valide / invalide
    assert.equal((await post('/api/admin/password-reset-confirm', { access_token: 'faux-jeton-faux-jeton-0000', password: 'un-mot-de-passe-long-4' })).status, 400);
    r = await post('/api/admin/password-reset-confirm', { access_token: 'sess-supabase-link-0000', password: 'un-mot-de-passe-long-4' });
    assert.equal(r.status, 200); assert.equal(pwSet.length, 2);
  } finally { global.fetch = realFetch; }
});
