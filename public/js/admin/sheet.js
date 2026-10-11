// Fiche détaillée d'une demande : statut, contact rapide, alertes, notes internes, suivi, impression, suppression (RGPD).
import { el, icon } from '../lib/dom.js';
import { api, errorText } from './api.js';
import { STATUSES, STATUS_LABEL, CHANNELS, EVENT_LABEL, INSTALL_LABEL, badge, tag, fmtDateLong, fmtDateTime, relDays, parisToday, daysBetween, hoursSince, waiting, toast, copyText, confirmDialog, firstName, waNumber } from './util.js';
import { patchLocal, removeLocal, sameDay, byId } from './store.js';

const dlg = () => document.querySelector('[data-sheet]');
let onChanged = () => {};
export const setOnChanged = (f) => { onChanged = f; };

export async function openSheet(id) {
  const d = dlg();
  d.replaceChildren(el('div', { class: 'sheet__inner' }, [el('div', { class: 'sheet__body' }, [el('p', { class: 'empty', text: 'Chargement…' })])]));
  if (!d.open) d.showModal();
  let data;
  try { data = await api('request', { query: { id } }); }
  catch (e) { d.replaceChildren(el('div', { class: 'sheet__inner' }, [el('div', { class: 'sheet__body' }, [el('p', { class: 'error-text', text: errorText(e) }), el('button', { class: 'abtn', type: 'button', onclick: () => d.close() }, ['Fermer'])])])); return; }
  render(data.request, data.events);
}

function fact(label, ...content) { return [el('dt', { text: label }), el('dd', {}, content.flat())]; }
const copyBtn = (text, label) => el('button', { class: 'copy', type: 'button', onclick: () => copyText(text, label), 'aria-label': `Copier ${label.toLowerCase()}` }, ['Copier']);

function render(r, events) {
  const d = dlg();
  const today = parisToday();
  const days = daysBetween(today, r.event_date);
  const others = sameDay(r);
  const pkg = r.package_snapshot;
  const fn = firstName(r.name);

  // ── alertes à traiter
  const flags = [];
  if (r.status === 'nouvelle' && hoursSince(r.created_at) > 24) flags.push(['bad', `Demande en attente depuis ${waiting(r.created_at)} : à traiter en priorité.`]);
  if (others.length) flags.push(['warn', `Autre(s) demande(s) le même jour : ${others.map((o) => `${o.name || o.reference} (${STATUS_LABEL[o.status]})`).join(', ')}. Vérifier la disponibilité avant de confirmer.`]);
  if (r.installation_type === 'outdoor') flags.push(['warn', 'Installation en extérieur : règles de sécurité strictes à vérifier avec le client (traitement manuel).']);
  if (!r.photobooth_requested) flags.push(['warn', 'Sans Photobooth : besoin à préciser avec le client.']);
  if (days < 0 && r.status !== 'annulee') flags.push(['warn', 'La date de l’événement est passée.']);
  if (r.decrypt_error) flags.push(['bad', 'Données personnelles illisibles (clé de chiffrement différente ?).']);

  // ── statut
  const steps = el('div', { class: 'steps', role: 'group', 'aria-label': 'Statut de la demande' }, STATUSES.map((s) => el('button', {
    class: 'step-btn', type: 'button', 'aria-pressed': String(s.id === r.status),
    onclick: async () => {
      if (s.id === r.status) return;
      if (s.id === 'annulee' && !(await confirmDialog({ title: 'Annuler cette demande ?', message: 'Le statut passera à « Annulée » (la demande reste consultable).', confirmLabel: 'Marquer annulée', danger: true }))) return;
      try { await api('status', { method: 'POST', body: { id: r.id, status: s.id } }); patchLocal(r.id, { status: s.id }); toast(`Statut : ${s.label}`, 'good'); onChanged(); openSheet(r.id); }
      catch (e) { toast(errorText(e), 'bad'); }
    }
  }, [s.label])));

  // ── contact rapide (liens ouverts par l'administratrice ; rien n'est envoyé automatiquement)
  const subject = encodeURIComponent(`Votre demande WAWA PHOTOBOOTH — ${r.reference}`);
  const body = encodeURIComponent(`Bonjour ${fn},\n\nMerci pour votre demande (référence ${r.reference}) pour votre ${(EVENT_LABEL[r.event_type] || 'événement').toLowerCase()} du ${fmtDateLong(r.event_date)}.\n\n`);
  const quick = el('div', { class: 'quick' }, [
    r.phone ? el('a', { class: 'abtn abtn--sm', href: `tel:${r.phone.replace(/[^+\d]/g, '')}` }, [icon('phone'), 'Appeler']) : null,
    r.email ? el('a', { class: 'abtn abtn--sm', href: `mailto:${r.email}?subject=${subject}&body=${body}` }, [icon('mail'), 'Écrire']) : null,
    r.phone ? el('a', { class: 'abtn abtn--sm', href: `https://wa.me/${waNumber(r.phone)}`, target: '_blank', rel: 'noopener noreferrer' }, ['WhatsApp']) : null,
    r.event_address ? el('a', { class: 'abtn abtn--sm', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.event_address)}`, target: '_blank', rel: 'noopener noreferrer' }, [icon('pin'), 'Itinéraire']) : null
  ]);

  // ── suivi : notes internes chiffrées + trace des contacts
  const list = el('ul', { class: 'timeline' }, [el('li', { 'data-k': 'status' }, [el('strong', { text: 'Demande reçue' }), el('small', { text: fmtDateTime(r.created_at) })])]);
  const addEvent = (e) => {
    if (e.kind === 'created') return;
    let title; let text = e.note;
    if (e.kind === 'status') title = `Statut : ${STATUS_LABEL[e.from_status] || '—'} → ${STATUS_LABEL[e.to_status] || e.to_status}`;
    else if (e.kind === 'contact') title = `Contact : ${CHANNELS[e.to_status] || e.to_status}`;
    else title = 'Note interne';
    if (e.note_unreadable) text = '(note illisible)';
    list.append(el('li', { 'data-k': e.kind }, [el('strong', { text: title }), el('small', { text: `${fmtDateTime(e.created_at)}${e.actor ? ' · ' + e.actor : ''}` }), text ? el('p', { text }) : null]));
  };
  events.forEach(addEvent);

  const ta = el('textarea', { maxlength: 2000, placeholder: 'Note interne (visible uniquement par l’équipe) : demande du client, rappel, décision…', 'aria-label': 'Nouvelle note interne' });
  const post = async (payload, okMsg) => {
    try { const res = await api('note', { method: 'POST', body: { id: r.id, ...payload } }); addEvent(res.event); toast(okMsg, 'good'); return true; }
    catch (e) { toast(errorText(e), 'bad'); return false; }
  };
  const noteForm = el('div', { class: 'note-form' }, [ta, el('div', { class: 'row' }, [
    el('button', { class: 'abtn abtn--gold abtn--sm', type: 'button', onclick: async () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; } if (await post({ text: t }, 'Note enregistrée (chiffrée)')) ta.value = ''; } }, ['Ajouter la note']),
    el('span', { class: 'muted', text: 'Tracer un contact :' }),
    ...Object.entries(CHANNELS).map(([k, label]) => el('button', { class: 'abtn abtn--sm', type: 'button', onclick: async () => { const t = ta.value.trim(); if (await post({ channel: k, text: t || undefined }, `Contact tracé : ${label}`)) ta.value = ''; } }, [label]))
  ])]);

  const info = el('dl', { class: 'facts' }, [
    ...fact('Occasion', EVENT_LABEL[r.event_type] || r.event_type, r.event_type_other ? tag(r.event_type_other) : null),
    ...fact('Date', el('strong', { text: fmtDateLong(r.event_date) }), tag(relDays(r.event_date), days < 0 ? '' : days <= 14 ? 'warn' : '')),
    ...fact('Heure de début', r.start_time),
    ...fact('Invités', String(r.guest_count)),
    ...fact('Adresse', r.event_address || '—', r.event_address ? copyBtn(r.event_address, 'Adresse') : null),
    ...fact('Installation', INSTALL_LABEL[r.installation_type] || r.installation_type, r.installation_type === 'outdoor' ? tag('Règles extérieur', 'warn') : null)
  ]);
  const prest = el('dl', { class: 'facts' }, [
    ...fact('Photobooth', r.photobooth_requested ? tag('Oui', 'good') : tag('Non')),
    r.photobooth_requested ? fact('Formule', pkg ? `${pkg.name}${pkg.price_eur != null ? ` · ${pkg.price_eur} €` : ''}${pkg.duration_hours ? ` · ${pkg.duration_hours} h` : ''}` : 'Aucune choisie') : [],
    ...fact('Bar à magnets', r.magnet_bar_requested ? tag('Oui', 'good') : tag('Non')),
    r.couple_first_names ? fact('Inscription tirages', r.couple_first_names) : [],
  ].flat());
  const client = el('dl', { class: 'facts' }, [
    ...fact('Nom', r.name || '—'),
    ...fact('Email', r.email || '—', r.email ? copyBtn(r.email, 'Email') : null),
    ...fact('Téléphone', r.phone || '—', r.phone ? copyBtn(r.phone, 'Téléphone') : null),
    ...fact('Prospection', r.marketing_consent ? tag('Consentement donné', 'good') : tag('Pas de consentement'))
  ]);

  const del = el('button', { class: 'abtn abtn--danger abtn--sm', type: 'button', onclick: async () => {
    const ok = await confirmDialog({ title: 'Supprimer définitivement ?', message: `La demande ${r.reference} et son historique seront effacés (droit à l’effacement). Cette action est irréversible.`, confirmLabel: 'Supprimer', danger: true, typeToConfirm: r.reference });
    if (!ok) return;
    try { await api('delete', { method: 'POST', body: { id: r.id } }); removeLocal(r.id); toast('Demande supprimée', 'good'); d.close(); onChanged(); } catch (e) { toast(errorText(e), 'bad'); }
  } }, [icon('trash'), 'Supprimer (RGPD)']);

  d.replaceChildren(el('div', { class: 'sheet__inner' }, [
    el('div', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__top' }, [el('h2', { id: 'sheet-title', text: `${r.name || 'Client'} · ${r.reference}` }), badge(r.status),
        el('button', { class: 'abtn abtn--ghost abtn--sm no-print', type: 'button', onclick: () => d.close(), 'aria-label': 'Fermer la fiche' }, [icon('x'), 'Fermer'])]),
      steps, quick
    ]),
    el('div', { class: 'sheet__body' }, [
      flags.length ? el('div', { class: 'flags' }, flags.map(([k, t]) => el('div', { class: `alert-box${k === 'bad' ? ' alert-box--bad' : ''}` }, [icon('alert'), el('span', { text: t })]))) : null,
      el('section', { class: 'card' }, [el('h2', { text: 'Événement' }), info]),
      el('section', { class: 'card' }, [el('h2', { text: 'Prestation demandée' }), prest, el('p', { class: 'muted mb-0', text: 'Les tarifs sont indicatifs (grille non validée) et hors frais de déplacement éventuels, à confirmer.' })]),
      el('section', { class: 'card' }, [el('h2', { text: 'Client' }), client]),
      el('section', { class: 'card' }, [el('h2', { text: 'Suivi et notes internes' }), list, noteForm]),
      el('div', { class: 'sheet__actions no-print' }, [el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => window.print() }, [icon('printer'), 'Imprimer la fiche']), del])
    ])
  ]));
  d.querySelector('.sheet__body').scrollTop = 0;
}

export function initSheet() {
  const d = dlg();
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // clic sur le fond
}
