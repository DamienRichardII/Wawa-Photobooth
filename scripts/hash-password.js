#!/usr/bin/env node
'use strict';
// Produit ADMIN_PASSWORD_HASH (scrypt). Le mot de passe est saisi sans écho (ou lu sur stdin si redirigé).
const { hashPassword } = require('../lib/crypto');

function ask() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => resolve(d.replace(/\r?\n$/, ''))); return; }
    process.stdout.write('Mot de passe admin (12 caractères minimum) : ');
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    let pw = '';
    process.stdin.on('data', (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); return resolve(pw); }
        if (c === '\u0003') process.exit(1);
        if (c === '\u007f') pw = pw.slice(0, -1); else pw += c;
      }
    });
  });
}
(async () => {
  const pw = await ask();
  if (pw.length < 12) { console.error('Mot de passe trop court (12 caractères minimum).'); process.exit(1); }
  console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(pw)}`);
})();
