import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { hashPassword, verifyPassword, createSession, verifySession, normalizeLead, parseFilters, createHandler, hashProxyKey } from '../server/core.mjs';

const now = Date.parse('2026-10-15T03:00:00Z');
const origin = 'https://campaign-akasia365mc.vercel.app';
const secret = 'test-secret-with-enough-entropy-for-session-signing';
const validLead = { id: 'b1873772-a937-41a7-a6bd-d6514709b25e', name: 'QA Example', phone: '0856 1234 5678', area: 'Perut Bawah', consent: true, utm: { utm_source: 'meta', utm_campaign: 'promo15' }, page_url: origin + '/?utm_source=meta' };

test('password verification accepts only the original password', async () => {
  const record = await hashPassword('a-long-test-password', webcrypto);
  assert.equal(await verifyPassword('a-long-test-password', record, webcrypto), true);
  assert.equal(await verifyPassword('wrong-password', record, webcrypto), false);
});

test('signed sessions reject tampering, expiry and use on another host', async () => {
  const token = await createSession(secret, 'campaign-akasia365mc.vercel.app', now, webcrypto);
  assert.equal(await verifySession(token, secret, 'campaign-akasia365mc.vercel.app', now, webcrypto), true);
  assert.equal(await verifySession(token + 'x', secret, 'campaign-akasia365mc.vercel.app', now, webcrypto), false);
  assert.equal(await verifySession(token, secret, 'akasia.netlify.app', now, webcrypto), false);
  assert.equal(await verifySession(token, secret, 'campaign-akasia365mc.vercel.app', now + 9 * 3600000, webcrypto), false);
});

test('lead validation normalizes Indonesian phone and whitelists attribution', () => {
  const lead = normalizeLead({ ...validLead, utm: { ...validLead.utm, email: 'excluded', utm_content: '<script>x</script>' } }, origin);
  assert.equal(lead.phone, '6285612345678');
  assert.equal(lead.utm_source, 'meta');
  assert.equal(lead.utm_campaign, 'promo15');
  assert.equal(lead.environment, 'production');
  assert.equal(lead.email, undefined);
  assert.equal(lead.consent, true);
  assert.throws(() => normalizeLead({ ...validLead, consent: false }, origin));
  assert.throws(() => normalizeLead({ ...validLead, phone: '123' }, origin));
  assert.throws(() => normalizeLead({ ...validLead, area: 'invented' }, origin));
});

test('date filters cover entire selected days in Jakarta and reject reversed dates', () => {
  const filters = parseFilters(new URLSearchParams('from=2026-10-15&to=2026-10-15&page=2&limit=25&q=QA'));
  assert.equal(filters.after, '2026-10-14T17:00:00.000Z');
  assert.equal(filters.before, '2026-10-15T17:00:00.000Z');
  assert.equal(filters.offset, 25);
  assert.equal(filters.limit, 25);
  assert.throws(() => parseFilters(new URLSearchParams('from=2026-10-16&to=2026-10-15')));
  assert.throws(() => parseFilters(new URLSearchParams('from=2026-02-30')));
});

async function fixture() {
  const config = { ...await hashPassword('a-long-test-password', webcrypto), session_secret: secret };
  config.proxy_key_hash = await hashProxyKey('test-proxy-key', webcrypto);
  const rows = new Map(); const buckets = new Map();
  const store = {
    getConfig: async () => config,
    consumeLimit: async (key, limit) => { const n = (buckets.get(key) || 0) + 1; buckets.set(key, n); return n <= limit; },
    insertLead: async lead => { if (!rows.has(lead.id)) rows.set(lead.id, lead); },
    listLeads: async () => ({ rows: [...rows.values()], total: rows.size, page: 1, limit: 25 }),
    getFacets: async () => ({ sources: ['meta'], campaigns: ['promo15'], total: rows.size }),
  };
  const handler = createHandler({ store, now: () => now, crypto: webcrypto });
  const req = (route, body, cookie, suppliedOrigin = origin) => new Request(origin + route, { method: body ? 'POST' : 'GET', headers: { 'x-campaign-route': route, 'x-campaign-host': new URL(origin).host, 'x-campaign-ip': 'test-client', ...(body ? { 'content-type': 'application/json', origin: suppliedOrigin } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { handler, req: (...args) => { const request = req(...args); request.headers.set('x-campaign-proxy-key', 'test-proxy-key'); return request; }, rows };
}

test('results and facets require a valid session; login returns only secure server cookies', async () => {
  const p = await fixture();
  for (const route of ['/api/results/data', '/api/results/facets']) {
    const response = await p.handler(p.req(route));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const locked = await p.handler(p.req('/result'));
  assert.match(await locked.text(), /Masuk/);
  const wrong = await p.handler(p.req('/api/results/login', { password: 'wrong' }));
  assert.equal(wrong.status, 401);
  const login = await p.handler(p.req('/api/results/login', { password: 'a-long-test-password' }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  const results = await p.handler(p.req('/api/results/data', null, cookie.split(';')[0]));
  assert.equal(results.status, 200);
  const dashboard = await p.handler(p.req('/result', null, cookie.split(';')[0]));
  assert.match(await dashboard.text(), /Data Submission/);
  const logout = await p.handler(p.req('/api/results/logout', {}, cookie.split(';')[0]));
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('saved submissions are idempotent and the public endpoint never returns private rows', async () => {
  const p = await fixture();
  for (let i = 0; i < 2; i++) {
    const response = await p.handler(p.req('/api/leads', validLead));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
  assert.equal(p.rows.size, 1);
  const blocked = await p.handler(p.req('/api/leads', validLead, null, 'https://unrelated.example'));
  assert.equal(blocked.status, 403);
  const invalid = await p.handler(p.req('/api/leads', { ...validLead, consent: false }));
  assert.equal(invalid.status, 400);
});

test('login throttling caps repeated password guesses', async () => {
  const p = await fixture();
  let response;
  for (let i = 0; i < 6; i++) response = await p.handler(p.req('/api/results/login', { password: 'wrong' }));
  assert.equal(response.status, 429);
});
test('direct backend callers cannot bypass the proxy by forging forwarded identity', async () => {
  const p = await fixture();
  for (const key of [null, 'wrong-proxy-key']) {
    const request = p.req('/api/leads', validLead);
    request.headers.delete('x-campaign-proxy-key');
    if (key) request.headers.set('x-campaign-proxy-key', key);
    request.headers.set('x-campaign-ip', webcrypto.randomUUID());
    assert.equal((await p.handler(request)).status, 403);
  }
  assert.equal(p.rows.size, 0);
});
