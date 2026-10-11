import { el, icon } from '../../lib/dom.js';
import { api, errorText } from '../api.js';
import { state, patchLocal, conflicts } from '../store.js';
import { STATUSES, STATUS_LABEL, EVENT_LABEL, badge, tag, fmtDateShort, waiting, hoursSince, toast, relDays, parisToday, daysBetween } from '../util.js';
import { openSheet } from '../sheet.js';
import { EVENT_TYPES } from '../../booking/data.js';

const UI = { view: 'list', sort: 'received' };
try { UI.view = sessionStorage.getItem('wawa_adm_view') === 'kanban' ? 'kanban' : 'list'; } catch { /* */ }

export function render(box, params, rerender) {
  const f = { status: params.get('status') || '', q: params.get('q') || '', type: params.get('type') || '', period: params.get('period') || '' };
  const go = (patch) => { const n = { ...f, ...patch }; const qs = new URLSearchParams(Object.entries(n).filter(([, v]) => v)); location.hash = `#/requests${qs.toString() ? '?' + qs : ''}`; };
  const today = parisToday();
  const q = f.q.trim().toLowerCase();
  const conf = conflicts();

  const matches = (r) => (!f.type || r.event_type === f.type)
    && (!q || [r.reference, r.name, r.email, r.phone, EVENT_LABEL[r.event_type]].some((x) => x && String(x).toLowerCase().includes(q)))
    && (f.period !== 'upcoming' || r.event_date >= today) && (f.period !== 'past' || r.event_date < today)
    && (f.period !== '30' || (r.event_date >= today && daysBetween(today, r.event_date) <= 30));
  const base = state.requests.filter(matches);
  const rows = base.filter((r) => !f.status || r.status === f.status);
  const sorters = { received: (a, b) => (a.created_at < b.created_at ? 1 : -1), event: (a, b) => (a.event_date + a.start_time < b.event_date + b.start_time ? -1 : 1), name: (a, b) => String(a.name).localeCompare(String(b.name), 'fr') };
  rows.sort(sorters[UI.sort]);

  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer par statut' }, [
    el('button', { class: 'chip', type: 'button', 'aria-pressed': String(!f.status), onclick: () => go({ status: '' }) }, ['Toutes', el('small', { text: String(base.length) })]),
    ...STATUSES.map((s) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(f.status === s.id), onclick: () => go({ status: s.id }) }, [s.label, el('small', { text: String(base.filter((r) => r.status === s.id).length) })]))]);

  const search = el('input', { type: 'search', class: 'grow', value: f.q, placeholder: 'Nom, email, téléphone, référence…', 'aria-label': 'Rechercher dans les demandes' });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') go({ q: search.value.trim() }); });
  search.addEventListener('search', () => go({ q: search.value.trim() }));
  const sel = (label, key, opts) => el('select', { 'aria-label': label, onchange: (e) => go({ [key]: e.target.value }) }, opts.map(([v, t]) => el('option', { value: v, selected: f[key] === v, text: t })));
  const typeSel = sel('Occasion', 'type', [['', 'Toutes les occasions'], ...EVENT_TYPES.map((t) => [t.id, t.label])]);
  const periodSel = sel('Période de l’événement', 'period', [['', 'Toutes les dates'], ['30', 'Événement sous 30 jours'], ['upcoming', 'Événements à venir'], ['past', 'Événements passés']]);
  const sortSel = el('select', { 'aria-label': 'Trier', onchange: (e) => { UI.sort = e.target.value; rerender(); } }, [['received', 'Plus récentes'], ['event', 'Date d’événement'], ['name', 'Nom']].map(([v, t]) => el('option', { value: v, selected: UI.sort === v, text: `Tri : ${t}` })));
  const viewSeg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Affichage' }, [['list', 'Liste'], ['kanban', 'Pipeline']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(UI.view === v), onclick: () => { UI.view = v; try { sessionStorage.setItem('wawa_adm_view', v); } catch { /* */ } rerender(); } }, [t])));
  const exportBtn = el('button', { class: 'abtn abtn--sm', type: 'button', onclick: async () => {
    try { const blob = await api('export', { query: { status: f.status } }); const a = el('a', { href: URL.createObjectURL(blob), download: `demandes-wawa-${today}.csv` }); document.body.append(a); a.click(); a.remove(); toast('Export CSV généré (action journalisée)', 'good'); }
    catch (e) { toast(errorText(e), 'bad'); } } }, [icon('download'), 'Export CSV']);

  async function move(id, status) {
    try { await api('status', { method: 'POST', body: { id, status } }); patchLocal(id, { status }); toast(`Statut : ${STATUS_LABEL[status]}`, 'good'); rerender(); }
    catch (e) { toast(errorText(e), 'bad'); }
  }
  const flags = (r) => [
    conf.has(r.event_date) && r.status !== 'annulee' ? tag('Date en conflit', 'warn') : null,
    r.installation_type === 'outdoor' ? tag('Extérieur', 'warn') : null,
    !r.photobooth_requested ? tag('Sans photobooth') : null,
    r.magnet_bar_requested ? tag('Magnets') : null
  ];

  let content;
  if (UI.view === 'list') {
    content = rows.length ? el('div', { class: 'table-wrap' }, [el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Reçue', 'Client', 'Événement', 'Date', 'Formule', 'Statut'].map((h) => el('th', { scope: 'col', text: h })))]),
      el('tbody', {}, rows.map((r) => el('tr', { class: `row${r.status === 'nouvelle' ? ' row--new' : ''}`, tabindex: 0, onclick: () => openSheet(r.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(r.id); } } }, [
        el('td', {}, [fmtDateShort(String(r.created_at).slice(0, 10)), el('span', { class: 'cell-sub', text: r.reference })]),
        el('td', {}, [el('strong', { text: r.name || '—' }), el('span', { class: 'cell-sub', text: r.email || '' })]),
        el('td', {}, [EVENT_LABEL[r.event_type] || r.event_type, el('span', { class: 'cell-sub' }, flags(r).filter(Boolean).flatMap((t) => [t, ' ']))]),
        el('td', {}, [fmtDateShort(r.event_date), el('span', { class: 'cell-sub', text: `${r.start_time} · ${relDays(r.event_date)}` })]),
        el('td', {}, [r.package_snapshot ? r.package_snapshot.name : (r.photobooth_requested ? '—' : 'Sans photobooth'), r.package_snapshot && r.package_snapshot.price_eur != null ? el('span', { class: 'cell-sub', text: `${r.package_snapshot.price_eur} €` }) : null]),
        el('td', {}, [badge(r.status), r.status === 'nouvelle' && hoursSince(r.created_at) > 24 ? el('span', { class: 'cell-sub', text: `en attente ${waiting(r.created_at)}` }) : null])
      ])))])]) : el('p', { class: 'empty card', text: state.requests.length ? 'Aucune demande ne correspond à ces filtres.' : 'Aucune demande pour le moment. Les nouvelles demandes apparaîtront ici automatiquement.' });
  } else {
    content = el('div', { class: 'kanban' }, STATUSES.map((s) => {
      const items = base.filter((r) => r.status === s.id).sort(sorters[UI.sort]);
      const col = el('section', { class: 'col', 'aria-label': s.label }, [el('div', { class: 'col__head' }, [badge(s.id), el('span', { class: 'n', text: String(items.length) })]),
        ...items.map((r) => {
          const card = el('article', { class: 'kcard', draggable: 'true', tabindex: 0, 'data-id': r.id, onkeydown: (e) => { if (e.target === card && (e.key === 'Enter')) openSheet(r.id); } }, [
            el('strong', { text: r.name || '—' }), el('small', { text: `${EVENT_LABEL[r.event_type] || r.event_type} · ${fmtDateShort(r.event_date)}` }),
            el('small', { text: `${r.guest_count} invités${r.package_snapshot ? ' · ' + r.package_snapshot.name : ''}` }),
            el('div', { class: 'kcard__meta' }, flags(r).filter(Boolean)),
            el('div', { class: 'row', style: false }, [el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => openSheet(r.id) }, ['Ouvrir']),
              el('select', { 'aria-label': `Changer le statut de ${r.name || r.reference}`, onchange: (e) => move(r.id, e.target.value) }, STATUSES.map((x) => el('option', { value: x.id, selected: x.id === r.status, text: x.label })))])]);
          card.addEventListener('dragstart', (e) => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
          return card;
        })]);
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); const r = state.requests.find((x) => x.id === id); if (r && r.status !== s.id) move(id, s.id); });
      return col;
    }));
  }

  box.replaceChildren(el('div', { class: 'toolbar' }, [search, typeSel, periodSel, sortSel, viewSeg, exportBtn]), el('div', { class: 'toolbar' }, [chips, el('span', { class: 'muted', text: `${rows.length} demande(s)` })]), content);
}
