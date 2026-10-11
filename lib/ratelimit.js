'use strict';
// Limiteur en mémoire (fenêtre glissante). Sur hébergement serverless, chaque instance a sa propre mémoire :
// c'est une première barrière, doublée par un contrôle en base (voir handlers) et par le pare-feu de l'hébergeur.
const buckets = new Map();

function hit(key, limit, windowMs, now = Date.now()) {
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return { ok: true };
}
function reset() { buckets.clear(); }

module.exports = { hit, reset };
