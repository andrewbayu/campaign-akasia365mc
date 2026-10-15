import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, createSession, hashProxyKey, parseFilters } from '../server/core.mjs';
import { createStore } from '../server/store.mjs';

test('analytics requires a dashboard session and applies all filters without pagination', async () => {
  const origin = 'https://campaign.365mcindonesia.com', secret = 'analytics-test-session'; let filters;
  const store = { getConfig: async () => ({ password_hash:'unused', session_secret:secret, proxy_key_hash:await hashProxyKey('test-proxy') }), getAnalytics: async value => { filters=value; return { total:316, trend:[], sources:[], forms:[], areas:[] }; } };
  const handler = createHandler({ store });
  const request = cookie => new Request(origin+'/api/results/analytics?from=2026-10-15&to=2026-10-15&area=Perut+%26+pinggang&form=body-concern-check&source=meta&campaign=promo&consultation=yes&q=0812&page=2&limit=25', { headers:{ 'x-campaign-proxy-key':'test-proxy', ...(cookie?{cookie}: {}) } });
  assert.equal((await handler(request())).status,401);
  const cookie='__Host-akasia_results='+await createSession(secret,new URL(origin).host,Date.now());
  const response=await handler(request(cookie)); assert.equal(response.status,200); assert.equal((await response.json()).total,316); assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(filters.area,'Perut & pinggang'); assert.equal(filters.form,'body-concern-check'); assert.equal(filters.source,'meta'); assert.equal(filters.campaign,'promo'); assert.equal(filters.consultation,'yes'); assert.equal(filters.q,'0812');
  assert.equal(filters.after,'2026-10-14T17:00:00.000Z'); assert.equal(filters.before,'2026-10-15T17:00:00.000Z');
});

test('analytics RPC receives common normalized filters, excludes pagination and returns no contact rows', async () => {
  let sent;
  const store=createStore({url:'https://example.supabase.co',key:'sb_secret_test',fetcher:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return Response.json({total:316,trend:[]});}});
  const data=await store.getAnalytics(parseFilters(new URLSearchParams('q=0812&area=Lengan&source=__none__&page=3&limit=25')));
  assert.equal(data.total,316); assert.match(sent.url,/rpc\/akasia_campaign_analytics$/);
  assert.equal(sent.body.p_search,'62812'); assert.equal(sent.body.p_area,'Lengan'); assert.equal(sent.body.p_source,'__none__'); assert.equal(sent.body.limit,undefined); assert.equal(sent.body.offset,undefined);
});
