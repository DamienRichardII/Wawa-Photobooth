// État partagé : liste des demandes (source : API), dérivés (conflits de dates, compteurs), actualisation périodique.
import { api } from './api.js';
import { parisToday } from './util.js';

export const state = { requests: [], loaded: false, loadedAt: 0, messages: [], health: null, prevIds: null };
const listeners = new Set();
export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => listeners.forEach((f) => f());

export async function loadRequests({ silent = false } = {}) {
  const data = await api('requests');
  const fresh = data.items;
  let added = [];
  if (state.prevIds) added = fresh.filter((r) => !state.prevIds.has(r.id));
  state.prevIds = new Set(fresh.map((r) => r.id));
  state.requests = fresh; state.loaded = true; state.loadedAt = Date.now();
  emit();
  return { added, silent };
}
export async function loadMessages() { const d = await api('messages'); state.messages = d.items; emit(); return d; }
export async function loadHealth() { const d = await api('health'); state.health = d.checks; emit(); return d; }

export const byId = (id) => state.requests.find((r) => r.id === id) || null;
export const patchLocal = (id, patch) => { const r = byId(id); if (r) Object.assign(r, patch); emit(); };
export const removeLocal = (id) => { state.requests = state.requests.filter((r) => r.id !== id); emit(); };

export const count = (status) => state.requests.filter((r) => r.status === status).length;
export const active = () => state.requests.filter((r) => r.status !== 'annulee');

/** Dates où au moins 2 demandes (non annulées) coexistent : risque de double réservation. */
export function conflicts() {
  const m = new Map();
  for (const r of active()) { if (!m.has(r.event_date)) m.set(r.event_date, []); m.get(r.event_date).push(r); }
  for (const [k, v] of [...m]) if (v.length < 2) m.delete(k);
  return m;
}
export const sameDay = (r) => active().filter((x) => x.event_date === r.event_date && x.id !== r.id);
export const upcoming = () => { const t = parisToday(); return active().filter((r) => r.event_date >= t).sort((a, b) => (a.event_date + a.start_time < b.event_date + b.start_time ? -1 : 1)); };
