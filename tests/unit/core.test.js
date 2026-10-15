'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../lib/crypto');
const totp = require('../../lib/totp');
const { validateBooking, validateContact, parisToday, addDays } = require('../../lib/validate');
const rl = require('../../lib/ratelimit');

const KEY = Buffer.alloc(32, 7);
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const good = (over = {}) => ({
  event_type: 'mariage', event_address: '12 rue de la Paix, 75002 Paris', installation_type: 'indoor',
  photobooth_requested: true, photobooth_model: 'classique', photobooth_package_id: 'decouverte', magnet_bar_requested: false, couple_first_names: 'Aya et Sam',
  event_date: '2027-06-12', start_time: '18:00', guest_count: 120,
  first_name: 'Aya', last_name: 'Martin', email: 'Aya.Martin@Example.com', phone: '+33 6 00 00 00 00',
  started_at: NOW - 60000, website: '', ...over
});
const ctx = { now: NOW, packageIds: ['decouverte', 'evasion'] };

test('crypto: AES-GCM aller-retour, falsification et AAD', () => {
  const t = c.encrypt('{"a":1}', KEY, 'WAWA-AAAA-BBBB');
  assert.equal(c.decrypt(t, KEY, 'WAWA-AAAA-BBBB'), '{"a":1}');
  assert.throws(() => c.decrypt(t, KEY, 'WAWA-OTHER'));
  const bad = t.slice(0, -2) + (t.endsWith('A') ? 'B' : 'A');
  assert.throws(() => c.decrypt(bad, KEY, 'WAWA-AAAA-BBBB'));
  assert.notEqual(c.encrypt('x', KEY), c.encrypt('x', KEY)); // IV aléatoire
});
test('crypto: scrypt et référence opaque', async () => {
  const h = await c.hashPassword('un-mot-de-passe-solide');
  assert.ok(await c.verifyPassword('un-mot-de-passe-solide', h));
  assert.ok(!(await c.verifyPassword('autre', h)));
  assert.ok(!(await c.verifyPassword('x', c.DUMMY_HASH)));
  assert.match(c.newReference(), /^WAWA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});
test('totp: vecteur RFC 4226/6238 et fenêtre', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(totp.hotp(secret, 1), '287082');
  assert.equal(totp.hotp(secret, 0), '755224');
  const b32 = totp.base32Encode(secret);
  assert.deepEqual(totp.base32Decode(b32), secret);
  const code = totp.hotp(secret, totp.stepOf(NOW));
  assert.equal(totp.verifyTotp(b32, code, NOW), totp.stepOf(NOW));
  assert.equal(totp.verifyTotp(b32, code, NOW + 120000), null);
  assert.equal(totp.verifyTotp(b32, '12ab56', NOW), null);
});
test('ratelimit: fenêtre glissante', () => {
  rl.reset();
  for (let i = 0; i < 3; i++) assert.ok(rl.hit('k', 3, 1000, 1000 + i).ok);
  assert.ok(!rl.hit('k', 3, 1000, 1500).ok);
  assert.ok(rl.hit('k', 3, 1000, 2500).ok);
});

test('validation: demande complète valide (normalisation email)', () => {
  const r = validateBooking(good(), ctx);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.value.email, 'aya.martin@example.com');
  assert.equal(r.value.photobooth_package_id, 'decouverte');
});
test('validation: Photobooth = Non ignore toute formule obsolète', () => {
  const r = validateBooking(good({ photobooth_requested: false, photobooth_package_id: 'evasion' }), ctx);
  assert.ok(r.ok);
  assert.equal(r.value.photobooth_package_id, null);
});
test('validation: formule requise si Oui, inconnue refusée, sans formule configurée autorisé', () => {
  assert.equal(validateBooking(good({ photobooth_package_id: undefined }), ctx).errors.photobooth_package_id, 'Choisissez une formule.');
  assert.ok(validateBooking(good({ photobooth_package_id: 'inconnue' }), ctx).errors.photobooth_package_id);
  assert.ok(validateBooking(good({ photobooth_package_id: undefined }), { now: NOW, packageIds: [] }).ok);
});
test('validation: prénoms des mariés seulement pour mariage/nikkah/fiançailles', () => {
  assert.equal(validateBooking(good({ event_type: 'anniversaire' }), ctx).value.couple_first_names, 'Aya et Sam');
  assert.equal(validateBooking(good({ event_type: 'nikkah-hlel' }), ctx).value.couple_first_names, 'Aya et Sam');
  assert.equal(validateBooking(good({ event_type: 'mariage', photobooth_requested: false, photobooth_package_id: null }), ctx).value.couple_first_names, null);
});
test('validation: dates (passée refusée, aujourd’hui accepté, calendrier réel)', () => {
  assert.ok(validateBooking(good({ event_date: '2026-10-10' }), ctx).errors.event_date);
  assert.ok(validateBooking(good({ event_date: parisToday(new Date(NOW)) }), ctx).ok);
  assert.ok(validateBooking(good({ event_date: '2027-02-30' }), ctx).errors.event_date);
  assert.ok(validateBooking(good({ event_date: addDays(parisToday(new Date(NOW)), 365 * 4) }), ctx).errors.event_date);
});
test('validation: champs invalides', () => {
  const e = (o) => validateBooking(good(o), ctx).errors;
  assert.ok(e({ start_time: '25:00' }).start_time);
  assert.ok(e({ guest_count: 0 }).guest_count);
  assert.ok(e({ guest_count: 12.5 }).guest_count);
  assert.ok(e({ guest_count: '120' }).guest_count);
  assert.ok(e({ guest_count: 5000 }).guest_count);
  assert.ok(e({ email: 'pas-un-mail' }).email);
  assert.ok(e({ email: 'a@b' }).email);
  assert.ok(e({ phone: 'abc' }).phone);
  assert.ok(e({ phone: '123' }).phone);
  assert.ok(e({ first_name: '<script>' }).first_name);
  assert.ok(e({ installation_type: 'jardin' }).installation_type);
  assert.ok(e({ event_type: 'inconnu' }).event_type);
  assert.ok(e({ photobooth_requested: 'oui' }).photobooth_requested);
  assert.ok(e({ event_address: 'ab' }).event_address);
  assert.ok(e({ address_place_id: 'x y; drop' }).address_place_id);
});
test('validation: champ inconnu, honeypot, trop rapide, corps invalide', () => {
  assert.ok(validateBooking(good({ is_admin: true }), ctx).errors._unknown);
  assert.ok(validateBooking(good({ website: 'http://spam' }), ctx).errors._spam);
  assert.ok(validateBooking(good({ started_at: NOW - 100 }), ctx).errors._spam);
  assert.ok(validateBooking(good({ started_at: undefined }), ctx).errors._spam);
  assert.ok(validateBooking(null, ctx).errors._body);
  assert.ok(validateBooking([], ctx).errors._body);
});
test('validation: prix envoyé par le client ignoré/refusé', () => {
  assert.ok(validateBooking(good({ price_eur: 1 }), ctx).errors._unknown);
});
test('validation: nettoyage des caractères de contrôle', () => {
  const r = validateBooking(good({ first_name: 'A\u0000ya‮' }), ctx);
  assert.equal(r.value.first_name, 'Aya');
});
test('validation: contact', () => {
  const ok = validateContact({ name: 'Aya', email: 'a@example.com', message: 'Bonjour, une question sur vos formules.', started_at: NOW - 60000, website: '' }, { now: NOW });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  assert.ok(validateContact({ name: 'A', email: 'x', message: 'court', started_at: NOW - 60000 }, { now: NOW }).errors.message);
});
