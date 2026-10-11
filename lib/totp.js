'use strict';
// TOTP RFC 6238 (SHA-1, 6 chiffres, pas de 30 s) — implémentation locale sans dépendance.
const crypto = require('crypto');
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
  const clean = String(s).replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const i = A.indexOf(ch);
    if (i < 0) throw new Error('bad_base32');
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function base32Encode(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function hotp(secret, counter) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(c).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1e6).padStart(6, '0');
}
const stepOf = (t = Date.now()) => Math.floor(t / 1000 / 30);

/** Retourne le pas (counter) validé ou null. Fenêtre ±1 pas. */
function verifyTotp(secretB32, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const secret = base32Decode(secretB32);
  const cur = stepOf(now);
  for (const d of [0, -1, 1]) {
    const expected = hotp(secret, cur + d);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return cur + d;
  }
  return null;
}
function generateSecret() { return base32Encode(crypto.randomBytes(20)); }

module.exports = { base32Decode, base32Encode, hotp, verifyTotp, generateSecret, stepOf };
