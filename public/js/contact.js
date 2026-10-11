import { $, el, icon } from './lib/dom.js';
import { loadConfig, postJson } from './lib/api.js';
import { setError, clearErrors, serverMessage, uuid } from './lib/forms.js';

const form = $('#contact-form');
const status = $('#cf-status');
const startedAt = Date.now();
const idem = uuid();
let sending = false;

// Coordonnées : affichées uniquement si elles sont renseignées dans config/site.json
loadConfig().then(({ config }) => {
  const { email, phone } = config.contact || {};
  if (email || phone) $('[data-contact-missing]').hidden = true;
  if (email) { const c = $('[data-contact-email]'); c.hidden = false; c.querySelector('p').replaceChildren(el('a', { href: `mailto:${email}`, text: email })); }
  if (phone) { const c = $('[data-contact-phone]'); c.hidden = false; c.querySelector('p').replaceChildren(el('a', { href: `tel:${phone.replace(/[^+\d]/g, '')}`, text: phone })); }
}).catch(() => {});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate() {
  clearErrors(form);
  const f = form.elements; let first = null;
  const bad = (input, msg) => { setError(input, msg); first = first || input; };
  if (!f.name.value.trim()) bad(f.name, 'Indiquez votre nom.');
  if (!EMAIL.test(f.email.value.trim())) bad(f.email, 'Indiquez une adresse email valide.');
  const phone = f.phone.value.trim();
  if (phone && (!/^\+?[0-9 ().\-]{6,25}$/.test(phone) || phone.replace(/\D/g, '').length < 6)) bad(f.phone, 'Numéro de téléphone invalide.');
  if (f.message.value.trim().length < 10) bad(f.message, 'Votre message doit contenir au moins 10 caractères.');
  if (first) first.focus();
  return !first;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending || !validate()) return;
  sending = true;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Envoi en cours…';
  status.replaceChildren();
  const f = form.elements;
  const res = await postJson('/api/contact', {
    name: f.name.value, email: f.email.value, phone: f.phone.value || null, message: f.message.value,
    website: f.website.value, started_at: startedAt, idempotency_key: idem
  });
  sending = false; btn.disabled = false; btn.textContent = 'Envoyer le message';
  if (res.ok) {
    form.reset();
    status.replaceChildren(el('div', { class: 'notice' }, [icon('check'), el('p', {}, [`Merci, votre message a bien été enregistré (référence ${res.data.reference}). Nous vous répondrons dès que possible.`])]));
  } else if (res.status === 422 && res.data && res.data.fields) {
    const map = { name: f.name, email: f.email, phone: f.phone, message: f.message };
    for (const [k, msg] of Object.entries(res.data.fields)) if (map[k]) setError(map[k], msg);
    status.replaceChildren(el('div', { class: 'notice notice--danger', role: 'alert' }, [icon('alert'), el('p', { text: 'Certains champs sont à corriger.' })]));
  } else {
    status.replaceChildren(el('div', { class: 'notice notice--danger', role: 'alert' }, [icon('alert'), el('p', { text: serverMessage(res) })]));
  }
});
