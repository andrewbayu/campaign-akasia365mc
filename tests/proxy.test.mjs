import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyRequest } from '../server/proxy.mjs';
import { createStore } from '../server/store.mjs';
import { parseFilters } from '../server/core.mjs';
test('the same-origin proxy restores HTML, preserves the session cookie and strips routing parameters', async () => {
  const previous = globalThis.fetch; let sent;
  globalThis.fetch = async (url, options) => { sent = { url, options }; return new Response('<html>Login</html>', { headers: { 'content-type': 'text/plain', 'set-cookie': '__Host-akasia_results=example; Secure; HttpOnly; Path=/', 'cache-control': 'private, no-store', 'content-length': '18' } }); };
  try {
    const response = await proxyRequest(new Request('https://akasia.netlify.app/result?__route=/result&from=2026-10-15', { headers: { cookie: 'existing=1', origin: 'https://akasia.netlify.app' } }));
    assert.match(response.headers.get('content-type'), /text\/html/); assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.equal(response.headers.has('content-length'), false);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(new URL(sent.url).searchParams.has('__route'), false); assert.equal(sent.options.headers.get('x-campaign-host'), 'akasia.netlify.app'); assert.equal(sent.options.headers.get('cookie'), 'existing=1');
    assert.equal((await proxyRequest(new Request('https://akasia.netlify.app/api/campaign?__route=/unrelated'))).status, 404);
  } finally { globalThis.fetch = previous; }
});
test('the database query applies date bounds, exact UTM filters, search and pagination together', async () => {
  let requested;
  const store = createStore({ url: 'https://example.supabase.co', key: 'sb_secret_test', fetcher: async (url, options) => { requested = { url: new URL(url), options }; return new Response('[]', { headers: { 'content-range': '25-49/64' } }); } });
  const data = await store.listLeads(parseFilters(new URLSearchParams('from=2026-10-15&to=2026-10-15&area=Lengan+Atas&source=meta&campaign=promo15&page=2&q=0812')));
  assert.equal(data.total, 64); assert.equal(data.page, 2);
  assert.deepEqual(requested.url.searchParams.getAll('created_at'), ['gte.2026-10-14T17:00:00.000Z', 'lt.2026-10-15T17:00:00.000Z']);
  assert.equal(requested.url.searchParams.get('offset'), '25'); assert.equal(requested.url.searchParams.get('utm_source'), 'eq.meta'); assert.equal(requested.url.searchParams.get('area'), 'eq.Lengan Atas'); assert.match(requested.url.searchParams.get('or'), /62812/);
  assert.equal(requested.options.headers.Authorization, undefined);
});
