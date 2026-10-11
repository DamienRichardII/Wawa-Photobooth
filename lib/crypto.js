'use strict';
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

function parseKey(raw) {
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

/** Chiffrement AES-256-GCM. `aad` lie le chiffré à son enregistrement (référence). */
function encrypt(plain, key, aad = '') {
  if (!key) throw new Error('encryption_key_missing');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

function decrypt(token, key, aad = '') {
  if (!key) throw new Error('encryption_key_missing');
  const [v, iv, tag, ct] = String(token).split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('bad_ciphertext');
  const d = crypto.createDecipheriv('aes-256-gcm', key, fromB64u(iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(fromB64u(tag));
  return Buffer.concat([d.update(fromB64u(ct)), d.final()]).toString('utf8');
}

function hmacHex(secret, data, len = 32) {
  return crypto.createHmac('sha256', secret).update(String(data)).digest('hex').slice(0, len);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // temps constant approximatif
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
function randomChunk(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
  return s;
}
/** Référence opaque (aucune donnée personnelle, non séquentielle). */
function newReference(prefix = 'WAWA') {
  return `${prefix}-${randomChunk(4)}-${randomChunk(4)}`;
}

// --- Mots de passe (scrypt) ---------------------------------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
function scryptAsync(password, salt, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: 128 * p.N * p.r * 2 }, (e, k) => (e ? reject(e) : resolve(k)));
  });
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64u(salt)}$${b64u(key)}`;
}
async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const params = { N: +N, r: +r, p: +p, keylen: fromB64u(hash).length };
    const key = await scryptAsync(password, fromB64u(salt), params);
    return crypto.timingSafeEqual(key, fromB64u(hash));
  } catch {
    return false;
  }
}
// Hash factice pour égaliser le temps de réponse quand l'identifiant est inconnu.
const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64u(Buffer.alloc(16, 1))}$${b64u(Buffer.alloc(64, 2))}`;

module.exports = { b64u, fromB64u, parseKey, encrypt, decrypt, hmacHex, safeEqual, newReference, hashPassword, verifyPassword, DUMMY_HASH };
