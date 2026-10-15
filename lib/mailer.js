'use strict';
// Notifications e-mail via Resend (API HTTPS). Sans configuration : statut « not_configured » (jamais de faux envoi).
// Les e-mails ne contiennent AUCUNE donnée personnelle (référence + type + date uniquement).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function configured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function send({ to, subject, text, html }, fetchImpl = fetch) {
  if (!configured() || !to) return { status: 'not_configured' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject, text, html }),
      signal: ctrl.signal
    });
    return { status: res.ok ? 'sent' : 'failed' };
  } catch { return { status: 'failed' }; } finally { clearTimeout(t); }
}

function adminUrl() {
  const o = (process.env.SITE_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '');
  return o ? `${o}/admin/` : null;
}

async function notifyTeamBooking({ reference, event_type, event_date }, fetchImpl) {
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) return { status: 'not_configured' };
  const link = adminUrl();
  const text = `Nouvelle demande de réservation ${reference}\nOccasion : ${event_type}\nDate souhaitée : ${event_date}\n${link ? `Consulter : ${link}` : 'Consultez l’espace d’administration.'}`;
  const html = `<p>Nouvelle demande de réservation <strong>${esc(reference)}</strong></p><p>Occasion : ${esc(event_type)}<br>Date souhaitée : ${esc(event_date)}</p><p>${link ? `<a href="${esc(link)}">Ouvrir l’administration</a>` : 'Consultez l’espace d’administration.'}</p>`;
  return send({ to: to.split(',').map((s) => s.trim()).filter(Boolean), subject: `Nouvelle demande ${reference}`, text, html }, fetchImpl);
}
async function notifyTeamContact({ reference }, fetchImpl) {
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) return { status: 'not_configured' };
  const link = adminUrl();
  return send({ to: to.split(',').map((s) => s.trim()).filter(Boolean), subject: `Nouveau message ${reference}`, text: `Nouveau message de contact ${reference}.\n${link ? `Consulter : ${link}` : ''}`, html: `<p>Nouveau message de contact <strong>${esc(reference)}</strong>.</p>` }, fetchImpl);
}
const OCCASIONS = { mariage: 'Mariage', 'nikkah-hlel': 'Nikkah / Hlel', fiancailles: 'Fiançailles', 'soiree-henne': 'Soirée henné', 'baby-shower': 'Baby shower', anniversaire: 'Anniversaire', 'soiree-privee': 'Soirée privée', 'evenement-pro': 'Événement professionnel', autre: 'Événement' };
const fmtDate = (iso) => { try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }); } catch { return iso; } };

// Accusé de réception au client : confirme la RÉCEPTION de la demande (jamais une réservation confirmée).
async function ackClient({ to, reference, first_name, event_type, event_date }, fetchImpl) {
  if (process.env.CLIENT_ACK_EMAIL !== 'true') return { status: 'disabled' };
  const name = first_name ? String(first_name).slice(0, 60) : '';
  const occ = OCCASIONS[event_type] || 'Événement';
  const when = event_date ? fmtDate(event_date) : '';
  const lines = [`Occasion : ${occ}`, when ? `Date souhaitée : ${when}` : null, `Référence : ${reference}`].filter(Boolean);
  const text = `Bonjour${name ? ' ' + name : ''},\n\nMerci pour votre demande, nous l’avons bien reçue.\n\n${lines.join('\n')}\n\nCeci est un accusé de réception : votre date n’est pas encore réservée. Notre équipe étudie votre demande, vérifie les disponibilités et vous recontacte rapidement pour la suite (devis et confirmation).\n\nÀ très vite,\nWAWA PHOTOBOOTH`;
  const li = lines.map((l) => { const [k, ...v] = l.split(' : '); return `<tr><td style="padding:4px 14px 4px 0;color:#7a6a4a">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v.join(' : '))}</strong></td></tr>`; }).join('');
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;background:#faf6ee;color:#2a2418"><h2 style="margin:0 0 4px;letter-spacing:.08em">WAWA PHOTOBOOTH</h2><p style="margin:0 0 18px;color:#9a7b2f">Capturez l’instant, gardez l’émotion.</p><p>Bonjour${name ? ' ' + esc(name) : ''},</p><p>Merci pour votre demande, nous l’avons bien reçue.</p><table style="margin:12px 0;border-collapse:collapse">${li}</table><p>Ceci est un <strong>accusé de réception</strong> : votre date n’est pas encore réservée. Notre équipe étudie votre demande, vérifie les disponibilités et vous recontacte rapidement pour la suite (devis et confirmation).</p><p>À très vite,<br>WAWA PHOTOBOOTH</p></div>`;
  return send({ to, subject: `Nous avons bien reçu votre demande (${reference})`, text, html }, fetchImpl);
}

module.exports = { configured, notifyTeamBooking, notifyTeamContact, ackClient, send };
