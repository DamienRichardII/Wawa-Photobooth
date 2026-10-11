// Faux back-end de démonstration : données entièrement fictives, conservées en mémoire (rien n'est enregistré).
import { ApiError } from './api.js';

const iso = (d) => d.toISOString();
const ago = (h) => iso(new Date(Date.now() - h * 3600e3));
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const P = (id, name, family, pa, h, price) => ({ id, name, family, print_allowance: pa, duration_hours: h, price_eur: price, is_featured: id === 'decouverte', is_active: true, sort_order: 10 });
const PK = { decouverte: P('decouverte', 'Formule Découverte', 'numerique', 'Photo numérique', 3, 150), emotion: P('emotion', 'Formule Émotion', 'tirages', 'Tirages illimités', 4, 350), supreme: P('supreme', 'Formule Suprême', 'tirages', 'Tirages illimités', 6, 600) };
const R = (n, name, email, status, ev, days, time, guests, hours, o = {}) => ({
  id: `demo-${n}`, reference: `WAWA-DEMO-${String(n).padStart(4, '0')}`, created_at: ago(hours), status, event_type: ev, event_date: inDays(days), start_time: time, guest_count: guests,
  installation_type: 'indoor', photobooth_requested: true, magnet_bar_requested: false, package_snapshot: PK.decouverte, name, email, phone: '+33 6 00 00 00 0' + n, decrypt_error: false,
  event_address: '12 rue de la Paix, 75002 Paris', couple_first_names: 'Aya et Sam', marketing_consent: false, ...o });
const db = {
  requests: [
    R(1, 'Aya Martin', 'aya.martin@exemple.fr', 'nouvelle', 'mariage', 120, '18:00', 140, 2, { package_snapshot: PK.supreme, magnet_bar_requested: true }),
    R(2, 'Sofia Benali', 'sofia.b@exemple.fr', 'nouvelle', 'anniversaire', 45, '20:00', 60, 30, { package_snapshot: PK.emotion, installation_type: 'outdoor' }),
    R(3, 'Karim Diallo', 'karim.d@exemple.fr', 'a-contacter', 'mariage', 120, '15:00', 200, 50, { package_snapshot: PK.emotion }),
    R(4, 'Laura Petit', 'laura.petit@exemple.fr', 'devis-envoye', 'soiree-privee', 20, '21:00', 80, 120),
    R(5, 'Entreprise Lumio', 'events@lumio.exemple.fr', 'confirmee', 'evenement-pro', 12, '19:00', 150, 240, { package_snapshot: PK.supreme }),
    R(6, 'Nadia Cherif', 'nadia.c@exemple.fr', 'confirmee', 'baby-shower', 70, '14:00', 40, 300, { photobooth_requested: false, package_snapshot: null }),
    R(7, 'Thomas Girard', 'thomas.g@exemple.fr', 'annulee', 'anniversaire', 30, '19:30', 50, 400)
  ],
  messages: [
    { id: 'm1', created_at: ago(5), name: 'Julie Morel', email: 'julie.m@exemple.fr', phone: null, message: 'Bonjour, proposez-vous un tarif pour un événement en Seine-et-Marne en semaine ?', status: 'nouveau', decrypt_error: false },
    { id: 'm2', created_at: ago(90), name: 'Marc Lefort', email: 'marc.l@exemple.fr', phone: '+33 6 11 22 33 44', message: 'Merci pour le devis, nous revenons vers vous rapidement.', status: 'traite', decrypt_error: false }
  ],
  events: {},
  packages: Object.values(PK).concat([P('essentiel', 'Formule Essentiel', 'numerique', 'Photo numérique', 2, 120)]).map((p, i) => ({ ...p, sort_order: (i + 1) * 10 })),
  audit: [
    { created_at: ago(1), actor: 'demo', action: 'login_ok', detail: null },
    { created_at: ago(2), actor: 'demo', action: 'status_change', detail: { reference: 'WAWA-DEMO-0003', to: 'a-contacter' } },
    { created_at: ago(26), actor: 'demo', action: 'export', detail: { rows: 7 } }
  ]
};
const find = (id) => db.requests.find((r) => r.id === id);
const nf = () => new ApiError(404, 'not_found');

export async function demoApi(action, { method = 'GET', body, query } = {}) {
  await new Promise((r) => setTimeout(r, 60));
  switch (action) {
    case 'me': return { email: 'Mode démonstration', csrf: 'demo', expires_at: Date.now() + 36e5 };
    case 'requests': return { items: db.requests.map((r) => ({ ...r })), total: db.requests.length, statuses: [] };
    case 'request': { const r = find(query.id); if (!r) throw nf(); return { request: { ...r }, events: db.events[r.id] || [] }; }
    case 'status': { const r = find(body.id); if (!r) throw nf(); r.status = body.status; (db.events[r.id] ||= []).push({ id: String(Math.random()), created_at: iso(new Date()), kind: 'status', from_status: null, to_status: body.status, actor: 'démo', note: null }); return { ok: true, status: r.status }; }
    case 'note': { const r = find(body.id); if (!r) throw nf(); const ev = { id: String(Math.random()), created_at: iso(new Date()), kind: body.channel ? 'contact' : 'note', from_status: null, to_status: body.channel || null, actor: 'démo', note: body.text || null }; (db.events[r.id] ||= []).push(ev); return { ok: true, event: ev }; }
    case 'delete': db.requests = db.requests.filter((r) => r.id !== body.id); return { ok: true, deleted: 1 };
    case 'messages': return { items: db.messages.map((m) => ({ ...m })), statuses: ['nouveau', 'traite'] };
    case 'message-status': { const m = db.messages.find((x) => x.id === body.id); if (m) m.status = body.status; return { ok: true }; }
    case 'packages': return { packages: db.packages.map((p) => ({ ...p })), source: 'database' };
    case 'package': { const i = db.packages.findIndex((p) => p.id === body.id); if (i >= 0) db.packages[i] = { ...db.packages[i], ...body }; else db.packages.push(body); return { ok: true }; }
    case 'seed-packages': return { ok: true };
    case 'audit': return { items: db.audit };
    case 'health': return { checks: [
      { id: 'storage', label: 'Base de données', ok: true, detail: 'Démonstration : données fictives en mémoire' },
      { id: 'encryption', label: 'Chiffrement des données personnelles', ok: true, detail: 'AES-256-GCM (actif en production)' },
      { id: 'mfa', label: 'Connexion administrateur', ok: false, detail: 'Désactivée temporairement pour la démonstration' },
      { id: 'email', label: 'Notification email de l’équipe', ok: false, detail: 'À configurer (RESEND_API_KEY, NOTIFY_EMAIL_TO)' },
      { id: 'retention', label: 'Durée de conservation', ok: false, detail: 'À valider avec Wawa Photobooth' }] };
    case 'export': return new Blob(['reference;statut\r\n' + db.requests.map((r) => `${r.reference};${r.status}`).join('\r\n')], { type: 'text/csv' });
    case 'logout': return { ok: true };
    default: throw nf();
  }
}
