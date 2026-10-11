'use strict';
const crypto = require('crypto');
const { b64u, fromB64u, safeEqual } = require('./crypto');
const { parseCookies, randomToken } = require('./http');
const { isHosted } = require('./env');

const TTL_S = 2 * 60 * 60; // 2 h, session absolue
const cookieName = () => (isHosted() ? '__Host-wp_admin' : 'wp_admin');

function secret() { return process.env.SESSION_SECRET || ''; }
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  if (!secret() || secret().length < 32) return null;
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  try {
    const p = JSON.parse(fromB64u(body).toString('utf8'));
    if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null;
    if ((p.ver || '1') !== (process.env.SESSION_VERSION || '1')) return null; // révocation globale
    return p;
  } catch { return null; }
}
function createSession(email) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: email, iat: now, exp: now + TTL_S, csrf: randomToken(24), ver: process.env.SESSION_VERSION || '1' };
  const attrs = [`${cookieName()}=${sign(payload)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${TTL_S}`];
  if (isHosted()) attrs.push('Secure');
  return { cookie: attrs.join('; '), payload };
}
function clearCookie() {
  const attrs = [`${cookieName()}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isHosted()) attrs.push('Secure');
  return attrs.join('; ');
}
function getSession(req) { return verify(parseCookies(req)[cookieName()]); }

module.exports = { createSession, clearCookie, getSession, sign, verify, cookieName, TTL_S };
