// Accès à l'API. Aucune donnée personnelle ne transite dans l'URL.
export async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal, credentials: 'same-origin' });
  if (!res.ok) throw Object.assign(new Error('http_' + res.status), { status: res.status });
  return res.json();
}

export async function postJson(url, payload, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload), signal: ctrl.signal, credentials: 'same-origin'
    });
    let data = null;
    try { data = await res.json(); } catch { /* corps non JSON */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, network: true, aborted: e.name === 'AbortError' };
  } finally { clearTimeout(timer); }
}

let cache;
export function loadConfig() {
  if (!cache) cache = getJson('/api/packages').catch((e) => { cache = null; throw e; });
  return cache;
}
