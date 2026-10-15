'use strict';
// Validation stricte côté serveur (source de vérité). Aucun champ inconnu n'est accepté.
const { siteConfig, intEnv } = require('./env');

const EVENT_TYPES = ['mariage', 'nikkah-hlel', 'fiancailles', 'soiree-henne', 'baby-shower', 'anniversaire', 'soiree-privee', 'evenement-pro', 'autre'];
const COUPLE_TYPES = ['mariage', 'nikkah-hlel', 'fiancailles'];
const INSTALLATION = ['indoor', 'outdoor'];
const MAX_GUESTS = 2000;
const BOOTHS = ['classique', 'bois'];

const BOOKING_KEYS = new Set([
  'event_type', 'event_type_other', 'event_address', 'address_place_id', 'installation_type',
  'photobooth_requested', 'photobooth_model', 'photobooth_package_id', 'magnet_bar_requested', 'couple_first_names', 'event_date', 'start_time',
  'guest_count', 'first_name', 'last_name', 'email', 'phone', 'marketing_consent',
  'idempotency_key', 'started_at', 'website'
]);
const CONTACT_KEYS = new Set(['name', 'email', 'phone', 'message', 'started_at', 'website', 'idempotency_key']);

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
function clean(s) {
  return String(s).replace(CTRL, '').replace(/\s+/g, ' ').trim();
}
function cleanMultiline(s) {
  return String(s).replace(CTRL, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parisToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); // YYYY-MM-DD
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isRealDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .\-’]{0,79}$/u;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE_RE = /^\+?[0-9 ().\-]{6,25}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PKG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PLACE_RE = /^[A-Za-z0-9._:\-]{1,120}$/;

function str(obj, key, errors, { required = false, min = 0, max = 200, multiline = false, label } = {}) {
  const v = obj[key];
  if (v === undefined || v === null || v === '') {
    if (required) errors[key] = `${label || key} est requis.`;
    return null;
  }
  if (typeof v !== 'string') { errors[key] = 'Valeur invalide.'; return null; }
  const c = multiline ? cleanMultiline(v) : clean(v);
  if (!c && required) { errors[key] = `${label || key} est requis.`; return null; }
  if (c.length < min) { errors[key] = `Minimum ${min} caractères.`; return null; }
  if (c.length > max) { errors[key] = `Maximum ${max} caractères.`; return null; }
  return c || null;
}

function checkEmail(v, errors, key = 'email') {
  const e = str({ [key]: v }, key, errors, { required: true, max: 254, label: 'L’email' });
  if (e && !EMAIL_RE.test(e)) { errors[key] = 'Adresse email invalide.'; return null; }
  return e ? e.toLowerCase() : null;
}
function checkPhone(v, errors, { required = true, key = 'phone' } = {}) {
  const p = str({ [key]: v }, key, errors, { required, max: 25, label: 'Le téléphone' });
  if (!p) return null;
  const digits = p.replace(/\D/g, '');
  if (!PHONE_RE.test(p) || digits.length < 6 || digits.length > 15) { errors[key] = 'Numéro de téléphone invalide.'; return null; }
  return p;
}

function checkAntiSpam(body, errors, { minFillMs = intEnv('MIN_FILL_MS', 4000), now = Date.now() } = {}) {
  if (body.website !== undefined && body.website !== '' && body.website !== null) errors._spam = 'Requête invalide.';
  const t = body.started_at;
  if (typeof t !== 'number' || !Number.isFinite(t)) errors._spam = 'Requête invalide.';
  else if (now - t < minFillMs || now - t > 24 * 3600 * 1000) errors._spam = 'Requête invalide.';
}

/**
 * @param {object} body
 * @param {{now?:number, packageIds?:string[]}} ctx
 */
function validateBooking(body, ctx = {}) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { _body: 'Corps invalide.' } };
  for (const k of Object.keys(body)) if (!BOOKING_KEYS.has(k)) errors._unknown = 'Champ non autorisé.';
  const cfg = siteConfig().booking || {};
  const now = ctx.now || Date.now();

  checkAntiSpam(body, errors, { now, minFillMs: ctx.minFillMs });

  const v = {};
  // Étape 1
  v.event_type = body.event_type;
  if (!EVENT_TYPES.includes(v.event_type)) { errors.event_type = 'Choisissez une occasion.'; v.event_type = null; }
  v.event_type_other = v.event_type === 'autre' ? str(body, 'event_type_other', errors, { max: 120 }) : null;

  // Étape 2
  v.event_address = str(body, 'event_address', errors, { required: true, min: 5, max: 250, label: 'L’adresse' });
  const place = body.address_place_id;
  v.address_place_id = null;
  if (place !== undefined && place !== null && place !== '') {
    if (typeof place === 'string' && PLACE_RE.test(place)) v.address_place_id = place;
    else errors.address_place_id = 'Identifiant d’adresse invalide.';
  }
  if (!INSTALLATION.includes(body.installation_type)) errors.installation_type = 'Indiquez intérieur ou extérieur.';
  v.installation_type = INSTALLATION.includes(body.installation_type) ? body.installation_type : null;

  // Étape 3 / 4
  if (typeof body.photobooth_requested !== 'boolean') errors.photobooth_requested = 'Indiquez si vous souhaitez un Photobooth.';
  v.photobooth_requested = body.photobooth_requested === true;
  v.photobooth_package_id = null;
  v.photobooth_model = null;
  if (v.photobooth_requested) {
    if (!BOOTHS.includes(body.photobooth_model)) errors.photobooth_model = 'Choisissez un modèle de Photobooth.'; else v.photobooth_model = body.photobooth_model;
    const pid = body.photobooth_package_id;
    const ids = ctx.packageIds;
    if (pid === undefined || pid === null || pid === '') {
      if (ids && ids.length > 0) errors.photobooth_package_id = 'Choisissez une formule.';
    } else if (typeof pid !== 'string' || !PKG_RE.test(pid)) {
      errors.photobooth_package_id = 'Formule invalide.';
    } else if (ids && !ids.includes(pid)) {
      errors.photobooth_package_id = 'Cette formule n’est pas disponible.';
    } else v.photobooth_package_id = pid;
  } // sinon : toute valeur reçue est ignorée → null

  // Étape 5 : Bar à magnets (oui / non, indépendant du Photobooth)
  if (typeof body.magnet_bar_requested !== 'boolean') errors.magnet_bar_requested = 'Indiquez si vous souhaitez un Bar à magnets.';
  v.magnet_bar_requested = body.magnet_bar_requested === true;

  // Étape 6
  const coupleOk = v.photobooth_requested === true; // « Inscription pour les tirages » : texte à imprimer, toutes occasions, avec Photobooth
  v.couple_first_names = coupleOk ? str(body, 'couple_first_names', errors, { max: 120 }) : null;

  const d = body.event_date;
  if (typeof d !== 'string' || !isRealDate(d)) errors.event_date = 'Indiquez une date valide.';
  else {
    const today = parisToday(new Date(now));
    const min = addDays(today, Math.max(0, cfg.minLeadDays || 0));
    if (d < min) errors.event_date = d < today ? 'La date ne peut pas être passée.' : 'Cette date est trop proche.';
    else if (d > addDays(today, 365 * 3)) errors.event_date = 'Date trop éloignée.';
  }
  v.event_date = errors.event_date ? null : d;

  if (typeof body.start_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.start_time)) errors.start_time = 'Indiquez une heure (HH:mm).';
  v.start_time = errors.start_time ? null : body.start_time;

  const g = body.guest_count;
  if (typeof g !== 'number' || !Number.isInteger(g) || g < 1 || g > MAX_GUESTS) errors.guest_count = `Indiquez un nombre d’invités entre 1 et ${MAX_GUESTS}.`;
  v.guest_count = errors.guest_count ? null : g;

  // Étape 6
  v.first_name = str(body, 'first_name', errors, { required: true, max: 80, label: 'Le prénom' });
  if (v.first_name && !NAME_RE.test(v.first_name)) { errors.first_name = 'Prénom invalide.'; v.first_name = null; }
  v.last_name = str(body, 'last_name', errors, { required: true, max: 80, label: 'Le nom' });
  if (v.last_name && !NAME_RE.test(v.last_name)) { errors.last_name = 'Nom invalide.'; v.last_name = null; }
  v.email = checkEmail(body.email, errors);
  v.phone = checkPhone(body.phone, errors);

  const mc = body.marketing_consent;
  if (mc !== undefined && typeof mc !== 'boolean') errors.marketing_consent = 'Valeur invalide.';
  v.marketing_consent = cfg.marketingConsentEnabled === true && mc === true;

  const idk = body.idempotency_key;
  if (idk !== undefined && idk !== null && !(typeof idk === 'string' && UUID_RE.test(idk))) errors.idempotency_key = 'Identifiant invalide.';
  v.idempotency_key = typeof idk === 'string' && UUID_RE.test(idk) ? idk.toLowerCase() : null;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: v };
}

function validateContact(body, ctx = {}) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { _body: 'Corps invalide.' } };
  for (const k of Object.keys(body)) if (!CONTACT_KEYS.has(k)) errors._unknown = 'Champ non autorisé.';
  checkAntiSpam(body, errors, { now: ctx.now || Date.now(), minFillMs: ctx.minFillMs });
  const v = {};
  v.name = str(body, 'name', errors, { required: true, max: 120, label: 'Le nom' });
  v.email = checkEmail(body.email, errors);
  v.phone = body.phone ? checkPhone(body.phone, errors, { required: false }) : null;
  v.message = str(body, 'message', errors, { required: true, min: 10, max: 2000, multiline: true, label: 'Le message' });
  const idk = body.idempotency_key;
  if (idk !== undefined && idk !== null && !(typeof idk === 'string' && UUID_RE.test(idk))) errors.idempotency_key = 'Identifiant invalide.';
  v.idempotency_key = typeof idk === 'string' && UUID_RE.test(idk) ? idk.toLowerCase() : null;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: v };
}

module.exports = { EVENT_TYPES, COUPLE_TYPES, MAX_GUESTS, validateBooking, validateContact, parisToday, addDays, isRealDate, clean };
