import { el, icon } from '../../lib/dom.js';
import { state, count, active, conflicts, upcoming } from '../store.js';
import { EVENT_LABEL, STATUS_LABEL, badge, tag, dateChip, fmtDateShort, fmtDateLong, parisToday, daysBetween, hoursSince, waiting, relDays } from '../util.js';
import { openSheet } from '../sheet.js';

const kpi = (href, label, value, hint, cls = '') => el('a', { class: `card kpi ${cls}`, href }, [el('span', { class: 'kpi__label', text: label }), el('span', { class: 'kpi__value', text: String(value) }), el('span', { class: 'kpi__hint', text: hint })]);
const lineBtn = (r, sub, right) => el('li', {}, [el('button', { class: 'line', type: 'button', onclick: () => openSheet(r.id) }, [dateChip(r.event_date), el('span', { class: 'line__main' }, [el('strong', { text: `${r.name || 'Client'} · ${EVENT_LABEL[r.event_type] || r.event_type}` }), el('small', { text: sub })]), right])]);

export function render(box) {
  const today = parisToday();
  const reqs = state.requests;
  const news = reqs.filter((r) => r.status === 'nouvelle');
  const toContact = reqs.filter((r) => r.status === 'a-contacter');
  const quotes = reqs.filter((r) => r.status === 'devis-envoye');
  const up = upcoming();
  const in30 = up.filter((r) => daysBetween(today, r.event_date) <= 30);
  const confirmedUp = up.filter((r) => r.status === 'confirmee');
  const late = news.filter((r) => hoursSince(r.created_at) > 24);
  const conf = conflicts();
  const health = state.health ? state.health.filter((c) => !c.ok && c.id !== 'hosted') : [];

  const alerts = [];
  if (health.length) alerts.push(el('div', { class: 'alert-box' }, [icon('alert'), el('div', {}, [el('strong', { text: 'Configuration incomplète : ' }), `${health.map((h) => h.label).join(', ')}. `, el('a', { href: '#/health', text: 'Voir le détail' })])]));
  if (late.length) alerts.push(el('div', { class: 'alert-box alert-box--bad' }, [icon('alert'), el('div', {}, [el('strong', { text: `${late.length} demande(s) sans réponse depuis plus de 24 h. ` }), el('a', { href: '#/requests?status=nouvelle', text: 'Les traiter' })])]));
  if (conf.size) alerts.push(el('div', { class: 'alert-box' }, [icon('calendar'), el('div', {}, [el('strong', { text: `${conf.size} date(s) avec plusieurs demandes : ` }), [...conf.keys()].sort().slice(0, 4).map(fmtDateShort).join(', '), '. ', el('a', { href: '#/calendar', text: 'Ouvrir le calendrier' })])]));

  // priorités : nouvelles (les plus anciennes d'abord) puis à contacter
  const todo = [...news.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)), ...toContact].slice(0, 7);
  const prio = el('section', { class: 'card' }, [el('h2', {}, [icon('check'), 'À traiter en priorité', el('span', { class: 'count', text: `${news.length + toContact.length} au total` })]),
    todo.length ? el('ul', { class: 'lines' }, todo.map((r) => lineBtn(r, `Reçue il y a ${waiting(r.created_at)} · ${relDays(r.event_date)} · ${r.guest_count} invités`, badge(r.status)))) : el('p', { class: 'empty', text: 'Rien en attente : toutes les demandes ont été traitées.' })]);

  const next = el('section', { class: 'card' }, [el('h2', {}, [icon('calendar'), 'Prochains événements', el('a', { class: 'count', href: '#/calendar', text: 'Calendrier' })]),
    up.length ? el('ul', { class: 'lines' }, up.slice(0, 7).map((r) => lineBtn(r, `${fmtDateLong(r.event_date)} · ${r.start_time} · ${relDays(r.event_date)}`, badge(r.status)))) : el('p', { class: 'empty', text: 'Aucun événement à venir.' })]);

  // répartition par occasion
  const byType = {}; reqs.forEach((r) => { byType[r.event_type] = (byType[r.event_type] || 0) + 1; });
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...types.map(([, n]) => n));
  const typeCard = el('section', { class: 'card' }, [el('h2', { text: 'Demandes par occasion' }),
    types.length ? el('div', { class: 'bars' }, types.map(([k, n]) => { const row = el('div', { class: 'bar' }, [el('span', { text: EVENT_LABEL[k] || k }), el('div', { class: 'bar__track' }, [el('div', { class: 'bar__fill' })]), el('b', { text: String(n) })]); row.querySelector('.bar__fill').style.setProperty('--w', `${Math.round((n / max) * 100)}%`); return row; })) : el('p', { class: 'empty', text: 'Pas encore de données.' })]);

  // 6 derniers mois
  const now = new Date(); const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d), n: 0 }); }
  reqs.forEach((r) => { const k = String(r.created_at).slice(0, 7); const m = months.find((x) => x.key === k); if (m) m.n++; });
  const mmax = Math.max(1, ...months.map((m) => m.n));
  const monthCard = el('section', { class: 'card' }, [el('h2', { text: 'Demandes reçues (6 derniers mois)' }), el('div', { class: 'months' }, months.map((m) => { const c = el('div', { class: 'months__col' }, [el('div', { class: 'months__bar' }), el('b', { text: String(m.n) }), el('span', { text: m.label })]); c.querySelector('.months__bar').style.setProperty('--h', `${Math.round((m.n / mmax) * 100)}%`); return c; }))]);

  box.replaceChildren(...alerts, el('div', { class: 'grid kpis' }, [
    kpi('#/requests?status=nouvelle', 'Nouvelles', news.length, news.length ? 'À traiter' : 'Tout est traité', news.length ? 'kpi--alert' : ''),
    kpi('#/requests?status=a-contacter', 'À contacter', toContact.length, 'Rappels à faire'),
    kpi('#/requests?status=devis-envoye', 'Devis envoyés', quotes.length, 'En attente de réponse'),
    kpi('#/requests?status=confirmee', 'Confirmées', confirmedUp.length, 'Événements à venir', 'kpi--good'),
    kpi('#/calendar', 'Événements sous 30 jours', in30.length, `${active().length} demande(s) active(s)`)
  ]), el('div', { class: 'grid cols-2' }, [prio, next]), el('div', { class: 'grid cols-2', style: false }, [typeCard, monthCard]));
  box.lastElementChild.style.marginTop = '16px'; box.children[box.children.length - 2].style.marginTop = '0';
}
