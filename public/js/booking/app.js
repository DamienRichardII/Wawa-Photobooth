import { $, $$, el, icon, prefersReducedMotion } from '../lib/dom.js';
import { loadConfig, postJson } from '../lib/api.js';
import { euro, durationLabel, FAMILY_LABEL } from '../lib/packages.js';
import { serverMessage, uuid } from '../lib/forms.js';
import { EVENT_LABEL, COUPLE_TYPES, INSTALL_LABEL, STEPS, FIELD_STEP } from './data.js';
import { initAddress } from './address.js';

// ─────────────────────────────────────────────────────────────────────────────
// État du parcours (en mémoire). Seules des réponses NON identifiantes sont
// mémorisées dans sessionStorage (2 h) ; coordonnées, adresse et prénoms : jamais.
// ─────────────────────────────────────────────────────────────────────────────
const form = $('#booking-form');
const card = $('#bk-card');
const startedAt = Date.now();
const state = {
  event_type: null, event_type_other: '', event_address: '', address_place_id: null, installation_type: null,
  photobooth_requested: null, photobooth_package_id: null, couple_first_names: '',
  event_date: '', start_time: '', guest_count: '', first_name: '', last_name: '', email: '', phone: '', marketing_consent: false
};
let cfg = { packages: [], included: [], bookingAvailable: true, config: { marketingConsentEnabled: false, henneAskCoupleNames: false, minLeadDays: 0, addressAutocomplete: null, contact: {} } };
let cfgError = false;
let current = 'event';
let returnToRecap = false;
let submitting = false;
let idemKey = uuid();
let dirtyAfterFailure = false;
let submitted = false;

const DRAFT_KEY = 'wawa_booking_draft_v1';
const DRAFT_TTL = 2 * 3600 * 1000;
const DRAFT_FIELDS = ['event_type', 'installation_type', 'photobooth_requested', 'photobooth_package_id', 'guest_count'];
const loadDraft = () => { try { const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (!d) return null; if (Date.now() - d.t > DRAFT_TTL) { sessionStorage.removeItem(DRAFT_KEY); return null; } return d.v; } catch { return null; } };
const saveDraft = () => { try { const v = {}; DRAFT_FIELDS.forEach((k) => { v[k] = state[k]; }); sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ t: Date.now(), v })); } catch { /* stockage indisponible : sans conséquence */ } };
const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* */ } };

// ── Helpers ──────────────────────────────────────────────────────────────────
const stepEl = (id) => $(`[data-step="${id}"]`, form);
const fieldEl = (name) => $(`[data-field="${name}"]`, form);
const visibleSteps = () => STEPS.filter((s) => s.id !== 'package' || state.photobooth_requested !== false);
const coupleApplies = () => COUPLE_TYPES.includes(state.event_type) || (state.event_type === 'soiree-henne' && cfg.config.henneAskCoupleNames);
const parisToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const frDate = (iso) => { try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)); } catch { return iso; } };
const activePackage = () => cfg.packages.find((p) => p.id === state.photobooth_package_id) || null;

// ── Erreurs ──────────────────────────────────────────────────────────────────
function setFieldError(name, message) {
  const f = fieldEl(name); if (!f) return;
  f.classList.toggle('has-error', Boolean(message));
  const span = $('.error-msg span', f); if (span) span.textContent = message || '';
  const target = $('input:not([type=radio]):not([type=checkbox])', f) || $('fieldset', f);
  if (target) { if (message) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid'); }
}
function clearStepErrors(id) {
  $$('[data-field]', stepEl(id)).forEach((f) => setFieldError(f.dataset.field, ''));
  const s = $('[data-summary]'); s.hidden = true; s.replaceChildren();
}
function focusField(name) {
  const f = fieldEl(name); if (!f) return;
  (f.querySelector('input:checked') || f.querySelector('input:not([type=hidden])') || f).focus();
}
function showErrors(errors, { announce = true } = {}) {
  const names = Object.keys(errors);
  names.forEach((n) => setFieldError(n, errors[n]));
  const s = $('[data-summary]');
  s.replaceChildren(
    el('strong', { text: names.length > 1 ? 'Merci de corriger les champs suivants :' : 'Merci de corriger le champ suivant :' }),
    el('ul', {}, names.map((n) => el('li', {}, [el('a', { href: `#${n}`, text: errors[n], onclick: (e) => { e.preventDefault(); focusField(n); } })])))
  );
  s.hidden = false;
  if (announce) { s.focus({ preventScroll: true }); s.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); }
}

// ── Validation (reflète la validation serveur ; le serveur reste la source de vérité) ──
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .\-’]{0,79}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const validators = {
  event: () => { const e = {}; if (!state.event_type) e.event_type = 'Choisissez une occasion.'; return e; },
  place: () => {
    const e = {};
    if (state.event_address.trim().length < 5) e.event_address = 'Indiquez l’adresse de l’événement (numéro, rue, ville).';
    if (!state.installation_type) e.installation_type = 'Indiquez si l’installation se fait en intérieur ou en extérieur.';
    return e;
  },
  photobooth: () => { const e = {}; if (state.photobooth_requested === null) e.photobooth_requested = 'Répondez par Oui ou par Non.'; return e; },
  package: () => {
    const e = {};
    if (state.photobooth_requested === true && cfg.packages.length > 0 && !activePackage()) e.photobooth_package_id = 'Choisissez une formule.';
    return e;
  },
  details: () => {
    const e = {};
    const min = addDays(parisToday(), Math.max(0, cfg.config.minLeadDays || 0));
    if (!state.event_date) e.event_date = 'Indiquez la date de l’événement.';
    else if (state.event_date < parisToday()) e.event_date = 'La date ne peut pas être passée.';
    else if (state.event_date < min) e.event_date = 'Cette date est trop proche : contactez-nous.';
    else if (state.event_date > addDays(parisToday(), 365 * 3)) e.event_date = 'Date trop éloignée.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(state.start_time)) e.start_time = 'Indiquez l’heure de début (HH:mm).';
    const g = Number(state.guest_count);
    if (state.guest_count === '' || !Number.isInteger(g) || g < 1 || g > 2000) e.guest_count = 'Indiquez un nombre d’invités entier, entre 1 et 2000.';
    return e;
  },
  contact: () => {
    const e = {};
    if (!NAME_RE.test(state.first_name.trim())) e.first_name = 'Indiquez votre prénom.';
    if (!NAME_RE.test(state.last_name.trim())) e.last_name = 'Indiquez votre nom.';
    if (!EMAIL_RE.test(state.email.trim()) || state.email.length > 254) e.email = 'Indiquez une adresse email valide.';
    const digits = state.phone.replace(/\D/g, '');
    if (!/^\+?[0-9 ().\-]{6,25}$/.test(state.phone.trim()) || digits.length < 6 || digits.length > 15) e.phone = 'Indiquez un numéro de téléphone valide.';
    return e;
  },
  recap: () => ({})
};
const firstIncomplete = () => { for (const s of visibleSteps()) { if (s.id === 'recap') break; if (Object.keys(validators[s.id]()).length) return s.id; } return null; };

// ── Affichage / navigation ───────────────────────────────────────────────────
function renderProgress() {
  const vis = visibleSteps();
  const pos = Math.max(0, vis.findIndex((s) => s.id === current));
  const total = vis.length;
  $('[data-progress-text]').textContent = `Étape ${pos + 1} sur ${total}`;
  $('[data-progress-name]').textContent = vis[pos].label;
  const bar = $('[data-progress-bar]'); bar.style.setProperty('--p', String(Math.round(((pos + 1) / total) * 100)));
  $('.bk-progress__track').setAttribute('aria-valuenow', String(Math.round(((pos + 1) / total) * 100)));
  $$('[data-total]').forEach((n) => { n.textContent = String(total); });
  $('[data-side-list]').replaceChildren(...vis.map((s, i) => {
    const stateName = i < pos ? 'done' : i === pos ? 'current' : 'todo';
    const label = el('span', { text: s.side });
    const inner = stateName === 'done' ? el('button', { type: 'button', onclick: () => { returnToRecap = false; goTo(s.id, 'back'); } }, [s.side, el('span', { class: 'visually-hidden', text: ' (modifier)' })]) : label;
    return el('li', { class: 'bk-side__item', 'data-state': stateName, 'aria-current': stateName === 'current' ? 'step' : false }, [inner]);
  }));
}
function renderNav() {
  const last = current === 'recap';
  const prev = $('[data-prev]'); const next = $('[data-next]'); const label = $('[data-next-label]');
  prev.hidden = current === 'event' || returnToRecap;
  if (last) {
    const blocked = cfg.bookingAvailable === false;
    label.textContent = blocked ? 'Envoi indisponible' : 'Envoyer ma demande';
    next.disabled = blocked || submitting;
  } else {
    label.textContent = returnToRecap ? 'Valider et revenir au récapitulatif' : 'Suivant';
    next.disabled = false;
  }
}
function goTo(id, dir = 'forward', { focus = true } = {}) {
  current = id;
  $('[data-viewport]').classList.toggle('bk-viewport-back', dir === 'back');
  $$('.bk-step', form).forEach((s) => { s.hidden = s.dataset.step !== id; });
  if (id === 'package') renderPackages();
  if (id === 'recap') renderRecap();
  if (id === 'details') syncDetailsUi();
  renderProgress(); renderNav();
  const vis = visibleSteps(); const pos = vis.findIndex((s) => s.id === id);
  $('[data-live]').textContent = `Étape ${pos + 1} sur ${vis.length} : ${vis[pos].label}`;
  if (focus) {
    const h = $('h2', stepEl(id)); if (h) h.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}
function next() {
  clearStepErrors(current);
  const errors = validators[current]();
  if (Object.keys(errors).length) { showErrors(errors); return; }
  if (current === 'recap') { submit(); return; }
  const vis = visibleSteps(); const i = vis.findIndex((s) => s.id === current);
  if (returnToRecap) {
    const missing = firstIncomplete();
    if (missing) { goTo(missing); return; }
    returnToRecap = false; goTo('recap'); return;
  }
  goTo(vis[i + 1].id);
}
function prev() {
  clearStepErrors(current);
  const vis = visibleSteps(); const i = vis.findIndex((s) => s.id === current);
  if (i > 0) goTo(vis[i - 1].id, 'back');
}
function edit(stepId) { returnToRecap = true; goTo(stepId, 'back'); }

// ── Étape 4 : formules réelles (configuration administrable) ─────────────────
function renderPackages() {
  const box = $('[data-packages]');
  if (cfgError) {
    box.replaceChildren(el('div', { class: 'notice notice--warn' }, [icon('alert'), el('div', {}, [el('p', { text: 'Les formules n’ont pas pu être chargées.' }), el('button', { type: 'button', class: 'btn btn--outline btn--sm', onclick: loadFormulas }, ['Réessayer'])])]));
    return;
  }
  if (!cfg.packages.length) {
    box.replaceChildren(el('div', { class: 'notice' }, [icon('info'), el('div', {}, [el('p', { class: 'mb-0' }, [el('strong', { text: 'Formules en cours de configuration.' })]), el('p', { class: 'mb-0', text: 'Vous pouvez continuer : votre demande sera transmise sans choix de formule et notre équipe reviendra vers vous avec une proposition.' })])]));
    return;
  }
  const groups = {};
  cfg.packages.forEach((p) => { (groups[p.family || 'autre'] = groups[p.family || 'autre'] || []).push(p); });
  const order = ['numerique', 'tirages', 'autre'].filter((k) => groups[k]);
  box.replaceChildren(...order.map((fam) => el('div', { class: 'pkg-group' }, [
    el('h3', {}, [icon(fam === 'tirages' ? 'infinity' : 'camera'), FAMILY_LABEL[fam] || 'Formules']),
    el('fieldset', { class: 'pkg-options', 'aria-label': FAMILY_LABEL[fam] || 'Formules' }, groups[fam].map((p) => {
      const meta = [fam === 'autre' ? p.print_allowance : null, durationLabel(p.duration_hours), p.description].filter(Boolean);
      const input = el('input', { type: 'radio', name: 'photobooth_package_id', value: p.id, checked: state.photobooth_package_id === p.id });
      return el('label', { class: 'choice pkg-choice' }, [input, el('span', { class: 'choice__box' }, [
        el('span', { class: 'pkg-choice__name', text: p.name }),
        p.price_eur !== undefined ? el('span', { class: 'pkg-choice__price', text: euro(p.price_eur) }) : null,
        ...meta.map((m) => el('span', { class: 'pkg-choice__meta', text: m })),
        el('span', { class: 'choice__tick' }, [icon('check')])
      ])]);
    }))
  ])));
}

// ── Étape 5 : champs conditionnels ───────────────────────────────────────────
function syncDetailsUi() {
  const couple = fieldEl('couple_first_names'); couple.hidden = !coupleApplies();
  const d = $('#event_date'); const min = addDays(parisToday(), Math.max(0, cfg.config.minLeadDays || 0));
  d.min = min; d.max = addDays(parisToday(), 365 * 3);
}

// ── Étape 7 : récapitulatif éditable ─────────────────────────────────────────
function recapSection(title, stepId, rows, extra) {
  return el('section', { class: 'recap__section', 'aria-label': title }, [
    el('div', { class: 'recap__head' }, [el('h3', { text: title }), el('button', { type: 'button', class: 'recap__edit', onclick: () => edit(stepId) }, [icon('pencil'), 'Modifier', el('span', { class: 'visually-hidden', text: ` : ${title}` })])]),
    el('dl', {}, rows.filter(Boolean).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
    extra || null
  ]);
}
function renderRecap() {
  const p = activePackage();
  const rows = [];
  rows.push(recapSection('Occasion', 'event', [['Occasion', EVENT_LABEL[state.event_type]], state.event_type === 'autre' && state.event_type_other.trim() ? ['Précision', state.event_type_other.trim()] : null]));
  rows.push(recapSection('Lieu', 'place', [['Adresse', state.event_address.trim()], ['Installation', INSTALL_LABEL[state.installation_type]]], el('p', { class: 'recap__note' }, [icon('info'), 'Frais de déplacement éventuels : à confirmer par notre équipe.'])));
  const pbRows = [['Photobooth', state.photobooth_requested ? 'Oui' : 'Non']];
  let pbExtra = null;
  if (state.photobooth_requested) {
    pbRows.push(['Formule', p ? p.name : cfg.packages.length ? '—' : 'Aucune (demande de devis)']);
    if (p) {
      const bits = [p.price_eur !== undefined ? euro(p.price_eur) : null, durationLabel(p.duration_hours), p.print_allowance].filter(Boolean);
      if (bits.length) pbRows.push(['Détail', bits.join(' · ')]);
      pbExtra = el('p', { class: 'recap__sub' }, [el('span', { class: 'hint', text: 'Tarif indicatif, hors frais éventuels. Confirmé par notre équipe.' }), el('button', { type: 'button', class: 'recap__edit', onclick: () => edit('package') }, [icon('pencil'), 'Modifier la formule'])]);
    }
  }
  rows.push(recapSection('Photobooth', 'photobooth', pbRows, pbExtra));
  rows.push(recapSection('Détails', 'details', [coupleApplies() && state.couple_first_names.trim() ? ['Prénoms des mariés', state.couple_first_names.trim()] : null, ['Date souhaitée', frDate(state.event_date)], ['Heure de début', state.start_time], ['Invités', String(state.guest_count)]]));
  rows.push(recapSection('Vos coordonnées', 'contact', [['Prénom', state.first_name.trim()], ['Nom', state.last_name.trim()], ['Email', state.email.trim()], ['Téléphone', state.phone.trim()]]));
  $('[data-recap]').replaceChildren(...rows);
  $('[data-submit-status]').replaceChildren();
}

// ── Envoi ────────────────────────────────────────────────────────────────────
function buildPayload() {
  const requested = state.photobooth_requested === true;
  const payload = {
    event_type: state.event_type,
    event_type_other: state.event_type === 'autre' && state.event_type_other.trim() ? state.event_type_other.trim() : null,
    event_address: state.event_address.trim(),
    address_place_id: state.address_place_id || null,
    installation_type: state.installation_type,
    photobooth_requested: requested,
    photobooth_package_id: requested ? (state.photobooth_package_id || null) : null,
    couple_first_names: coupleApplies() && state.couple_first_names.trim() ? state.couple_first_names.trim() : null,
    event_date: state.event_date, start_time: state.start_time, guest_count: Number(state.guest_count),
    first_name: state.first_name.trim(), last_name: state.last_name.trim(), email: state.email.trim(), phone: state.phone.trim(),
    idempotency_key: idemKey, started_at: startedAt, website: form.elements.website.value
  };
  if (cfg.config.marketingConsentEnabled) payload.marketing_consent = Boolean(state.marketing_consent);
  return payload;
}
function status(kind, text) {
  $('[data-submit-status]').replaceChildren(el('div', { class: `notice notice--${kind}`, role: kind === 'danger' ? 'alert' : 'status' }, [icon(kind === 'danger' ? 'alert' : 'info'), el('p', { class: 'mb-0', text })]));
}
async function submit() {
  if (submitting || submitted) return;
  // Re-validation complète avant envoi (retour éventuel sur l'étape fautive)
  const missing = firstIncomplete();
  if (missing) { goTo(missing); showErrors(validators[missing]()); return; }
  if (dirtyAfterFailure) { idemKey = uuid(); dirtyAfterFailure = false; }
  submitting = true; renderNav();
  const btn = $('[data-next]'); btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); $('[data-next-label]').textContent = 'Envoi en cours…';
  $('[data-submit-status]').replaceChildren();
  const res = await postJson('/api/booking-requests', buildPayload());
  submitting = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');

  if (res.ok && res.data && res.data.reference) { onSuccess(res.data); return; } // succès UNIQUEMENT si le serveur a confirmé l'enregistrement
  renderNav();
  if (res.status === 422 && res.data && res.data.fields) {
    const fields = res.data.fields; const first = Object.keys(fields).find((k) => FIELD_STEP[k]);
    if (first) { goTo(FIELD_STEP[first], 'back', { focus: false }); showErrors(fields); return; }
  }
  if (res.status === 503) cfg.bookingAvailable = false;
  status('danger', serverMessage(res).replace('Votre message n’a pas été transmis', 'Votre demande n’a pas été transmise'));
  renderNav();
  dirtyAfterFailure = false; // même contenu : on réutilise la clé d'idempotence (pas de doublon si la 1re requête avait abouti)
}
function onSuccess(data) {
  submitted = true; clearDraft();
  // purge des données personnelles de la mémoire de la page
  Object.assign(state, { event_address: '', first_name: '', last_name: '', email: '', phone: '', couple_first_names: '', address_place_id: null });
  form.reset();
  form.hidden = true; $('.bk-progress').hidden = true; $('#bk-banner').replaceChildren();
  const ok = $('[data-success]'); ok.hidden = false;
  $('[data-reference]').textContent = data.reference;
  $('[data-ack]').hidden = data.ack_email_sent !== true;
  $('[data-live]').textContent = `Votre demande a bien été reçue. Référence ${data.reference}.`;
  $$('.bk-side__item').forEach((li) => li.setAttribute('data-state', 'done'));
  ok.focus({ preventScroll: true }); card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

// ── Liaison formulaire → état + UI conditionnelle ────────────────────────────
function applyConditionalUi() {
  fieldEl('event_type_other').hidden = state.event_type !== 'autre';
  $('[data-outdoor-warning]').hidden = state.installation_type !== 'outdoor';
  $('[data-no-photobooth]').hidden = state.photobooth_requested !== false;
  const mk = fieldEl('marketing_consent'); mk.hidden = !cfg.config.marketingConsentEnabled;
}
form.addEventListener('input', onFieldEvent);
form.addEventListener('change', onFieldEvent);
function onFieldEvent(e) {
  const t = e.target; const name = t.name; if (!name || name === 'website') return;
  if (submitted) return;
  if (name === 'photobooth_requested') state.photobooth_requested = t.value === 'yes';
  else if (name === 'marketing_consent') state.marketing_consent = t.checked;
  else if (name in state) state[name] = t.value;
  if (name === 'event_type' && !coupleApplies()) { state.couple_first_names = ''; const c = $('#couple_first_names'); if (c) c.value = ''; }
  if (e.type === 'change' || t.type === 'radio') { applyConditionalUi(); if (current === 'photobooth' || name === 'photobooth_requested') { renderProgress(); renderNav(); } }
  setFieldError(FIELD_NAME_ALIAS[name] || name, '');
  const s = $('[data-summary]'); if (!s.hidden && !$('.has-error', stepEl(current))) { s.hidden = true; s.replaceChildren(); }
  if (state.event_date && name === 'event_date') { /* rien de plus */ }
  if (['event_type', 'installation_type', 'photobooth_requested', 'photobooth_package_id', 'guest_count'].includes(name)) saveDraft();
  dirtyAfterFailure = true;
}
const FIELD_NAME_ALIAS = {};

form.addEventListener('submit', (e) => { e.preventDefault(); next(); });
$('[data-prev]').addEventListener('click', prev);
form.addEventListener('keydown', (e) => { // Entrée dans un champ = Suivant ; jamais dans une liste de suggestions ouverte
  if (e.key === 'Enter' && e.target.matches('input[type=radio]')) { e.preventDefault(); next(); }
});

// ── Adresse : suggestions ────────────────────────────────────────────────────
function setupAddress() {
  const ac = cfg.config.addressAutocomplete;
  const input = $('#event_address');
  const ok = $('[data-address-ok]'); const down = $('[data-address-down]');
  const api = initAddress({
    input, list: $('#address-list'), endpoint: ac && ac.url,
    onSelect: ({ label, id }) => { state.event_address = label; state.address_place_id = id; ok.hidden = false; setFieldError('event_address', ''); },
    onClear: () => { state.address_place_id = null; ok.hidden = true; },
    onAvailability: (isUp) => { down.hidden = isUp; }
  });
  if (!ac || !ac.url) down.hidden = false;
  return api;
}

// ── Chargement de la configuration ───────────────────────────────────────────
async function loadFormulas() {
  try { cfg = await loadConfigFresh(); cfgError = false; } catch { cfgError = true; }
  if (current === 'package') renderPackages();
  renderBanner(); applyConditionalUi(); renderNav();
}
async function loadConfigFresh() { const c = await loadConfig(); return c; }
function renderBanner() {
  const b = $('#bk-banner');
  if (submitted) { b.replaceChildren(); return; }
  const parts = [];
  if (cfgError) parts.push(el('div', { class: 'notice notice--warn' }, [icon('alert'), el('p', { class: 'mb-0', text: 'Le serveur ne répond pas pour le moment : vous pouvez préparer votre demande, mais l’envoi pourrait échouer.' })]));
  else if (cfg.bookingAvailable === false) parts.push(el('div', { class: 'notice notice--danger' }, [icon('alert'), el('p', { class: 'mb-0', text: 'L’envoi des demandes en ligne n’est pas encore activé sur ce site. Vous pouvez préparer votre demande, mais elle ne pourra pas être transmise pour le moment.' })]));
  if (draftRestored) parts.push(el('div', { class: 'notice' }, [icon('info'), el('p', { class: 'mb-0' }, ['Vos choix précédents (non personnels) ont été conservés. ', el('button', { type: 'button', class: 'recap__edit', onclick: resetAll }, ['Recommencer à zéro'])])]));
  if (preselected) parts.push(el('div', { class: 'notice' }, [icon('check'), el('p', { class: 'mb-0', text: `Formule « ${preselected} » présélectionnée : vous pourrez la modifier à l’étape ${visibleSteps().findIndex((s) => s.id === 'package') + 1}.` })]));
  b.replaceChildren(...parts);
}
function resetAll() { clearDraft(); location.reload(); }

// ── Initialisation ───────────────────────────────────────────────────────────
let draftRestored = false; let preselected = null;
function hydrateInputs() {
  for (const [k, v] of Object.entries(state)) {
    const inputs = $$(`[name="${k}"]`, form); if (!inputs.length) continue;
    inputs.forEach((i) => {
      if (i.type === 'radio') i.checked = (k === 'photobooth_requested' ? (v === null ? false : (v ? 'yes' : 'no') === i.value) : v === i.value);
      else if (i.type === 'checkbox') i.checked = Boolean(v);
      else if (v !== null && v !== undefined) i.value = v;
    });
  }
}
(async function init() {
  const d = loadDraft();
  if (d) { for (const k of DRAFT_FIELDS) if (d[k] !== undefined && d[k] !== null) state[k] = d[k]; draftRestored = Boolean(d.event_type || d.installation_type || d.photobooth_requested !== null); }
  setupAddress();
  hydrateInputs(); applyConditionalUi(); goTo('event', 'forward', { focus: false });
  await loadFormulas();
  // ?formule=<id> (depuis les cartes de formules) : présélection validée contre la liste réelle
  const wanted = new URLSearchParams(location.search).get('formule');
  if (wanted) {
    const p = cfg.packages.find((x) => x.id === wanted);
    if (p) { state.photobooth_requested = true; state.photobooth_package_id = p.id; preselected = p.name; saveDraft(); hydrateInputs(); applyConditionalUi(); renderProgress(); renderBanner(); }
    history.replaceState(null, '', location.pathname); // l'URL ne garde aucune donnée
  }
  // Rétablit le choix des radios « Photobooth » après restauration
  $$('input[name="photobooth_requested"]').forEach((i) => { i.checked = state.photobooth_requested !== null && ((state.photobooth_requested ? 'yes' : 'no') === i.value); });
  renderProgress(); renderNav();
})();
