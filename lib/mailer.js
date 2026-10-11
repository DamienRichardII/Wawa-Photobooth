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
async function ackClient({ to, reference }, fetchImpl) {
  if (process.env.CLIENT_ACK_EMAIL !== 'true') return { status: 'disabled' };
  const text = `Bonjour,\n\nNous avons bien reçu votre demande (référence ${reference}). Elle sera étudiée par notre équipe ; la prestation sera confirmée après vérification des disponibilités et des modalités.\n\nWAWA PHOTOBOOTH`;
  return send({ to, subject: `Votre demande WAWA PHOTOBOOTH (${reference})`, text, html: `<p>Bonjour,</p><p>Nous avons bien reçu votre demande (référence <strong>${esc(reference)}</strong>). Elle sera étudiée par notre équipe ; la prestation sera confirmée après vérification des disponibilités et des modalités.</p><p>WAWA PHOTOBOOTH</p>` }, fetchImpl);
}

module.exports = { configured, notifyTeamBooking, notifyTeamContact, ackClient, send };
