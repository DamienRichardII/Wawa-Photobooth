import { el } from '../lib/dom.js';
export { EVENT_LABEL, INSTALL_LABEL } from '../booking/data.js';

export const STATUSES = [
  { id: 'nouvelle', label: 'Nouvelle' },
  { id: 'a-contacter', label: 'À contacter' },
  { id: 'devis-envoye', label: 'Devis envoyé' },
  { id: 'confirmee', label: 'Confirmée' },
  { id: 'annulee', label: 'Annulée' }
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
export const CHANNELS = { phone: 'Appel téléphonique', email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };

export const badge = (s) => el('span', { class: 'badge', 'data-s': s, text: STATUS_LABEL[s] || s });
export const tag = (text, kind = '') => el('span', { class: `tag${kind ? ' tag--' + kind : ''}`, text });

const TZ = 'Europe/Paris';
export const parisToday = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const isoToDate = (iso) => new Date(`${iso}T12:00:00Z`);
export const daysBetween = (aIso, bIso) => Math.round((isoToDate(bIso) - isoToDate(aIso)) / 86400000);
export const addDaysIso = (iso, n) => { const d = isoToDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtDateLong = (iso) => { try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'UTC' }).format(isoToDate(iso)); } catch { return iso || ''; } };
export const fmtDateShort = (iso) => { try { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(isoToDate(iso)); } catch { return iso || ''; } };
export const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }); } catch { return s || ''; } };
export const relDays = (iso) => { const n = daysBetween(parisToday(), iso); return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n === -1 ? 'hier' : n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`; };
export function waiting(createdAt) {
  const h = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3600000);
  if (h < 1) return 'à l’instant';
  if (h < 24) return `${Math.floor(h)} h`;
  return `${Math.floor(h / 24)} j`;
}
export const hoursSince = (createdAt) => (Date.now() - new Date(createdAt).getTime()) / 3600000;
export const ago = (ts) => { const s = Math.round((Date.now() - ts) / 1000); return s < 10 ? 'à l’instant' : s < 60 ? `il y a ${s} s` : `il y a ${Math.round(s / 60)} min`; };

export function dateChip(iso) {
  const d = isoToDate(iso);
  return el('div', { class: 'date-chip', 'aria-hidden': 'true' }, [el('small', { text: new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d) }), el('span', { text: String(d.getUTCDate()) })]);
}

// Toasts
export function toast(text, kind = '') {
  const box = document.querySelector('[data-toasts]'); if (!box) return;
  const t = el('div', { class: `toast${kind ? ' toast--' + kind : ''}`, text });
  box.append(t); setTimeout(() => t.remove(), 5500);
}

export async function copyText(text, label = 'Copié') {
  try { await navigator.clipboard.writeText(text); toast(`${label} dans le presse-papiers`, 'good'); }
  catch { toast('Copie impossible : sélectionnez le texte manuellement.', 'bad'); }
}

/** Boîte de confirmation accessible (<dialog>). `typeToConfirm` : texte à retaper pour valider (actions irréversibles). */
export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false, typeToConfirm = null }) {
  return new Promise((resolve) => {
    const dlg = document.querySelector('[data-confirm]');
    const input = typeToConfirm ? el('input', { type: 'text', autocomplete: 'off', 'aria-label': `Tapez ${typeToConfirm} pour confirmer`, placeholder: typeToConfirm }) : null;
    const ok = el('button', { class: `abtn ${danger ? 'abtn--danger' : 'abtn--gold'}`, type: 'submit', value: 'ok' }, [confirmLabel]);
    if (input) { ok.disabled = true; input.addEventListener('input', () => { ok.disabled = input.value.trim() !== typeToConfirm; }); }
    const form = el('form', { method: 'dialog' }, [el('h2', { text: title }), el('p', { class: 'mb-0', text: message }), input ? el('label', {}, [`Tapez « ${typeToConfirm} » pour confirmer`, input]) : null,
      el('div', { class: 'confirm__btns' }, [el('button', { class: 'abtn', type: 'submit', value: 'cancel' }, ['Annuler']), ok])]);
    dlg.replaceChildren(form); dlg.classList.remove('wide');
    const done = () => { dlg.removeEventListener('close', done); resolve(dlg.returnValue === 'ok'); };
    dlg.returnValue = ''; dlg.addEventListener('close', done); dlg.showModal(); (input || ok).focus();
  });
}

export const initials = (n) => (n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const firstName = (n) => String(n || '').split(/\s+/)[0] || '';
export function waNumber(phone) {
  const raw = String(phone || '').trim(); let d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0') && d.length === 10) return '33' + d.slice(1);
  return d;
}
