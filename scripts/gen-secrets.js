#!/usr/bin/env node
'use strict';
// Affiche des secrets aléatoires à copier dans les variables d'environnement (rien n'est écrit sur disque).
const crypto = require('crypto');
const { generateSecret } = require('../lib/totp');
const totp = generateSecret();
console.log(`SESSION_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`IP_HASH_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`);
console.log(`CRON_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
console.log(`ADMIN_TOTP_SECRET=${totp}`);
console.log(`\n# Ajoutez ce secret TOTP à votre application d'authentification (URI otpauth) :`);
console.log(`otpauth://totp/WAWA%20PHOTOBOOTH:admin?secret=${totp}&issuer=WAWA%20PHOTOBOOTH&digits=6&period=30`);
console.log('\n⚠ Conservez DATA_ENCRYPTION_KEY dans un gestionnaire de secrets : sa perte rend les données illisibles.');
