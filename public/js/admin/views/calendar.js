import { el, icon } from '../../lib/dom.js';
import { state, conflicts } from '../store.js';
import { STATUSES, EVENT_LABEL, badge, parisToday, fmtDateLong, fmtDateShort } from '../util.js';
import { openSheet } from '../sheet.js';

const cur = { y: null, m: null, showCancelled: false, day: null };

export function render(box, params, rerender) {
  const today = parisToday();
  if (cur.y === null) { cur.y = Number(today.slice(0, 4)); cur.m = Number(today.slice(5, 7)) - 1; }
  const first = new Date(Date.UTC(cur.y, cur.m, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7; // semaine commençant le lundi
  const daysIn = new Date(Date.UTC(cur.y, cur.m + 1, 0, 12)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const conf = conflicts();
  const list = state.requests.filter((r) => cur.showCancelled || r.status !== 'annulee');
  const byDay = new Map(); list.forEach((r) => { if (!byDay.has(r.event_date)) byDay.set(r.event_date, []); byDay.get(r.event_date).push(r); });
  const nav = (d) => { cur.m += d; if (cur.m < 0) { cur.m = 11; cur.y--; } if (cur.m > 11) { cur.m = 0; cur.y++; } cur.day = null; rerender(); };

  const head = el('div', { class: 'cal-head' }, [
    el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => nav(-1), 'aria-label': 'Mois précédent' }, [icon('chevron-left')]),
    el('h2', { text: monthLabel, 'aria-live': 'polite' }),
    el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => nav(1), 'aria-label': 'Mois suivant' }, [icon('chevron-right')]),
    el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => { cur.y = Number(today.slice(0, 4)); cur.m = Number(today.slice(5, 7)) - 1; cur.day = null; rerender(); } }, ['Aujourd’hui']),
    el('label', { class: 'check', style: false }, [el('input', { type: 'checkbox', checked: cur.showCancelled, onchange: (e) => { cur.showCancelled = e.target.checked; rerender(); } }), 'Afficher les annulées'])
  ]);

  const cells = [...['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => el('div', { class: 'cal__dow', text: d }))];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - offset + 1; const inMonth = dayNum >= 1 && dayNum <= daysIn;
    const d = new Date(Date.UTC(cur.y, cur.m, dayNum, 12)); const iso = d.toISOString().slice(0, 10);
    if (i >= 35 && !inMonth && dayNum > daysIn && i % 7 === 0) break;
    const evs = byDay.get(iso) || [];
    const cell = el('div', { class: `cal__day${inMonth ? '' : ' cal__day--out'}${iso === today ? ' cal__day--today' : ''}${conf.has(iso) ? ' cal__day--conflict' : ''}`, title: conf.has(iso) ? 'Plusieurs demandes ce jour-là' : false }, [
      el('span', { class: 'cal__num', text: String(d.getUTCDate()) }),
      ...evs.slice(0, 3).map((r) => el('button', { class: 'cal__ev', type: 'button', 'data-s': r.status, onclick: () => openSheet(r.id), 'aria-label': `${r.name || r.reference}, ${EVENT_LABEL[r.event_type] || ''}, ${fmtDateLong(iso)}, ${r.start_time}` }, [`${r.start_time} ${r.name || r.reference}`])),
      evs.length > 3 ? el('button', { class: 'cal__more', type: 'button', style: false, onclick: () => { cur.day = iso; rerender(); } }, [`+${evs.length - 3} autre(s)`]) : null
    ]);
    cells.push(cell);
  }
  const grid = el('div', { class: 'cal', role: 'grid', 'aria-label': `Événements de ${monthLabel}` }, cells);

  const monthEvents = list.filter((r) => r.event_date.startsWith(`${cur.y}-${String(cur.m + 1).padStart(2, '0')}`)).sort((a, b) => (a.event_date + a.start_time < b.event_date + b.start_time ? -1 : 1));
  const agenda = el('section', { class: 'card', style: false }, [el('h2', {}, [icon('calendar'), cur.day ? `Le ${fmtDateShort(cur.day)}` : 'Liste du mois', el('span', { class: 'count', text: `${(cur.day ? byDay.get(cur.day) || [] : monthEvents).length} événement(s)` })]),
    ...(() => { const arr = cur.day ? byDay.get(cur.day) || [] : monthEvents; return arr.length ? [el('ul', { class: 'lines' }, arr.map((r) => el('li', {}, [el('button', { class: 'line', type: 'button', onclick: () => openSheet(r.id) }, [el('span', { class: 'line__main' }, [el('strong', { text: `${fmtDateShort(r.event_date)} · ${r.start_time} — ${r.name || 'Client'}` }), el('small', { text: `${EVENT_LABEL[r.event_type] || r.event_type} · ${r.guest_count} invités` })]), badge(r.status)])])))] : [el('p', { class: 'empty', text: 'Aucun événement.' })]; })(),
    cur.day ? el('button', { class: 'abtn abtn--sm', type: 'button', onclick: () => { cur.day = null; rerender(); } }, ['Voir tout le mois']) : null]);
  agenda.style.marginTop = '16px';

  const legend = el('div', { class: 'legend' }, [...STATUSES.map((s) => badge(s.id)), el('span', { text: 'Contour orangé : plusieurs demandes le même jour (vérifier la disponibilité).' })]);
  box.replaceChildren(head, grid, legend, agenda);
}
