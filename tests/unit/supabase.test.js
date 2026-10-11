'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseStore } = require('../../lib/store/supabase');

function mock(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  return { calls, store: createSupabaseStore({ url: 'https://proj.supabase.co/', serviceKey: 'SERVICE_KEY', fetchImpl }) };
}

test('supabase: création de demande (URL, en-têtes, corps)', async () => {
  const { calls, store } = mock(() => ({ status: 201, body: [{ id: 'u1', reference: 'WAWA-X' }] }));
  const row = await store.createBookingRequest({ reference: 'WAWA-X', pii_encrypted: 'v1.a.b.c' });
  assert.equal(row.id, 'u1');
  assert.equal(calls[0].url, 'https://proj.supabase.co/rest/v1/booking_requests');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'SERVICE_KEY');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer SERVICE_KEY');
  assert.equal(calls[0].init.headers.Prefer, 'return=representation');
});
test('supabase: filtres encodés et ordre', async () => {
  const { calls, store } = mock(() => ({ status: 200, body: [] }));
  await store.listBookingRequests({ status: 'nouvelle', from: '2027-01-01' });
  assert.match(calls[0].url, /status=eq\.nouvelle/);
  assert.match(calls[0].url, /event_date=gte\.2027-01-01/);
  assert.match(calls[0].url, /order=created_at\.desc/);
  await store.findBookingByIdempotency('a&b=c');
  assert.match(calls[1].url, /idempotency_hash=eq\.a%26b%3Dc/); // pas d'injection de paramètre
});
test('supabase: les erreurs n’exposent jamais le corps de réponse (données potentielles)', async () => {
  const { store } = mock(() => ({ status: 409, body: { code: '23505', message: 'Key (email)=(secret@x.fr) already exists' } }));
  await assert.rejects(store.createBookingRequest({}), (e) => e.code === '23505' && !/secret@x\.fr/.test(JSON.stringify({ m: e.message, s: e.stack.split('\n')[0] })));
});
test('supabase: TOTP rejoué => false', async () => {
  const { store } = mock(() => ({ status: 409, body: { code: '23505' } }));
  assert.equal(await store.claimTotpStep(5), false);
});
test('supabase: changement de statut écrit un événement', async () => {
  const seen = [];
  const { store } = mock((url, init) => {
    seen.push(init.method + ' ' + url.split('/rest/v1/')[1].split('?')[0]);
    if (init.method === 'GET') return { status: 200, body: [{ id: 'u1', status: 'nouvelle' }] };
    return { status: 200, body: [{ id: 'u1', status: 'confirmee' }] };
  });
  await store.updateBookingStatus('u1', 'confirmee', 'admin');
  assert.deepEqual(seen, ['GET booking_requests', 'PATCH booking_requests', 'POST booking_request_events']);
});
