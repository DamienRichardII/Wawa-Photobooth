import { $ } from './dom.js';

export function setError(input, message) {
  const field = input.closest('.field');
  if (!field) return;
  const err = field.querySelector('.error-msg');
  field.classList.toggle('has-error', Boolean(message));
  if (message) { input.setAttribute('aria-invalid', 'true'); if (err) err.querySelector('span').textContent = message; }
  else { input.removeAttribute('aria-invalid'); if (err) err.querySelector('span').textContent = ''; }
}
export function clearErrors(form) {
  form.querySelectorAll('.has-error').forEach((f) => f.classList.remove('has-error'));
  form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
}

// Messages d'erreur serveur génériques (jamais d'erreur technique brute à l'écran)
export function serverMessage(res) {
  if (res.network) return res.aborted ? 'Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.' : 'Connexion impossible. Vérifiez votre connexion internet et réessayez.';
  switch (res.status) {
    case 429: return 'Trop de tentatives. Merci de patienter quelques minutes avant de réessayer.';
    case 503: return 'Le service d’envoi en ligne n’est pas encore activé. Votre message n’a pas été transmis : merci de nous contacter directement ou de réessayer plus tard.';
    case 400: return 'Votre envoi n’a pas pu être validé. Rechargez la page et réessayez.';
    case 403: return 'Envoi refusé par mesure de sécurité. Rechargez la page et réessayez.';
    default: return 'Une erreur est survenue. Votre demande n’a pas été enregistrée : merci de réessayer dans un instant.';
  }
}
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
export const $f = $;
