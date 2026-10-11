import { $, el, icon } from '../lib/dom.js';
import { api, session, setOnSessionLost, errorText, ApiError } from './api.js';
import { state, loadRequests, loadHealth, count, onChange } from './store.js';
import { initSheet, setOnChanged, openSheet } from './sheet.js';
import { toast, ago } from './util.js';
import * as dashboard from './views/dashboard.js';
import * as requests from './views/requests.js';
import * as calendar from './views/calendar.js';
import * as messages from './views/messages.js';
import * as packages from './views/packages.js';
import * as health from './views/health.js';
import * as audit from './views/audit.js';
import { initLogin } from './login.js';
import { DEMO } from './config.js';

const ROUTES = {
  dashboard: { title: 'Tableau de bord', icon: 'home', view: dashboard },
  requests: { title: 'Demandes', icon: 'users', view: requests },
  calendar: { title: 'Calendrier', icon: 'calendar', view: calendar },
  messages: { title: 'Messages', icon: 'mail', view: messages },
  packages: { title: 'Formules', icon: 'camera', view: packages },
  health: { title: 'Configuration', icon: 'shield', view: health },
  audit: { title: 'Journal', icon: 'lock', view: audit }
};
const view = (n) => document.querySelectorAll('[data-view]').forEach((s) => { s.hidden = s.dataset.view !== n; });
let timer = null; let tick = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, ''); const [path, qs] = raw.split('?');
  return { name: ROUTES[path] ? path : 'dashboard', params: new URLSearchParams(qs || '') };
}
function renderNav() {
  const { name } = parseHash();
  const badges = { requests: count('nouvelle') };
  $('[data-nav]').replaceChildren(...Object.entries(ROUTES).map(([k, r]) => el('a', { href: `#/${k}`, 'aria-current': k === name ? 'page' : false }, [icon(r.icon), r.title, badges[k] ? el('span', { class: 'badge-n', text: String(badges[k]), 'aria-label': `${badges[k]} nouvelle(s)` }) : null])));
  document.title = `${count('nouvelle') ? `(${count('nouvelle')}) ` : ''}${ROUTES[name].title} — Admin WAWA PHOTOBOOTH`;
}
async function route() {
  const { name, params } = parseHash(); const r = ROUTES[name];
  $('[data-title]').textContent = r.title; renderNav();
  $('#side').classList.remove('open'); $('[data-menu]').setAttribute('aria-expanded', 'false');
  const box = $('[data-content]');
  const rerender = () => r.view.render(box, params, rerender);
  if (!state.loaded) { box.replaceChildren(el('p', { class: 'empty', text: 'Chargement…' })); try { await loadRequests(); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) box.replaceChildren(el('p', { class: 'error-text', text: errorText(e) })); return; } loadHealth().catch(() => {}); }
  await r.view.render(box, params, rerender);
  window.scrollTo({ top: 0 });
}
async function refresh(manual = false) {
  try {
    const { added } = await loadRequests({ silent: true });
    if (added.length) toast(`${added.length} nouvelle(s) demande(s) reçue(s)`, 'good');
    if (manual || added.length) route();
    else renderNav();
  } catch (e) { if (manual) toast(errorText(e), 'bad'); }
}

export async function startApp(email) {
  session.email = email; view('app'); $('[data-who]').textContent = email;
  state.loaded = false; state.prevIds = null;
  await route();
  clearInterval(timer); clearInterval(tick);
  timer = setInterval(() => { if (!document.hidden) refresh(); }, 60000); // actualisation automatique
  tick = setInterval(() => { $('[data-updated]').textContent = state.loadedAt ? `Actualisé ${ago(state.loadedAt)}` : 'Actualiser'; }, 5000);
}

function showLogin(msg) { clearInterval(timer); clearInterval(tick); session.csrf = ''; view('login'); const m = $('[data-session-msg]'); m.textContent = msg || ''; m.hidden = !msg; initLogin.refreshConfig(); }
setOnSessionLost(() => showLogin('Votre session a expiré : reconnectez-vous.'));
setOnChanged(() => { renderNav(); route(); });
onChange(renderNav);

window.addEventListener('hashchange', route);
$('[data-logout]').addEventListener('click', async () => { try { await api('logout', { method: 'POST', body: {} }); } catch { /* */ } showLogin('Vous êtes déconnecté.'); });
$('[data-refresh]').addEventListener('click', () => refresh(true));
$('[data-menu]').addEventListener('click', () => { const s = $('#side'); const open = s.classList.toggle('open'); $('[data-menu]').setAttribute('aria-expanded', String(open)); });
$('[data-search-form]').addEventListener('submit', (e) => { e.preventDefault(); const q = new FormData(e.target).get('q').toString().trim(); location.hash = `#/requests${q ? '?q=' + encodeURIComponent(q) : ''}`; });
document.addEventListener('keydown', (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); $('[data-search-form] input').focus(); } });
initSheet();
initLogin(startApp);

(async () => {
  if (DEMO) {
    document.querySelector('[data-demo]').hidden = false; $('[data-logout]').hidden = true; session.csrf = 'demo';
    return startApp('Mode démonstration');
  }
  try { const r = await fetch('/api/admin/me', { credentials: 'same-origin' }); if (r.ok) { const d = await r.json(); session.csrf = d.csrf; return startApp(d.email); } } catch { /* */ }
  showLogin();
})();
