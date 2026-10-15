import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const origin = process.argv[2];
if (!origin) throw new Error('Provide the verified deployment origin');
const direct = process.argv.includes('--edge');
const endpoint = 'https://jpjsycnbamvxnwmziedh.supabase.co/functions/v1/akasia-campaign';
const password = (await readFile('.local/results-access.txt', 'utf8')).match(/Password: (.+)/)[1];
const id = randomUUID(), campaign = 'qa-' + id.slice(0, 8);
let ids = []; try { ids = JSON.parse(await readFile('.local/qa-ids.json', 'utf8')); } catch {}
ids.push(id); await writeFile('.local/qa-ids.json', JSON.stringify(ids));
async function request(route, body, cookie) {
  const parsed = new URL(route, origin);
  const response = await fetch(direct ? endpoint + parsed.search : parsed, { method: body ? 'POST' : 'GET', headers: { ...(direct ? { 'x-campaign-route': parsed.pathname, 'x-campaign-host': new URL(origin).host, 'x-campaign-ip': 'qa-verification' } : {}), ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  return response;
}
const locked = await request('/result'); assert.equal(locked.status, 200); assert.match(await locked.text(), /login-form/);
const denied = await request('/api/results/data'); assert.equal(denied.status, 401); assert.match(denied.headers.get('cache-control'), /no-store/);
const login = await request('/api/results/login', { password }); assert.equal(login.status, 200, 'Login failed: ' + await login.clone().text());
const cookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
const payload = { id, name: 'QA Verification', phone: '081200000000', area: 'Lengan Atas', consent: true, utm: { utm_source: 'qa', utm_medium: 'verification', utm_campaign: campaign, utm_content: 'integration-test', utm_term: 'QA', utm_id: 'QA' }, page_url: origin + '/?utm_source=qa&utm_campaign=' + campaign };
for (let i = 0; i < 2; i++) { const saved = await request('/api/leads', payload); assert.equal(saved.status, 200, await saved.clone().text()); assert.deepEqual(await saved.json(), { ok: true }); }
const environment = ['https://akasia.netlify.app', 'https://campaign-akasia365mc.vercel.app'].includes(origin) ? 'production' : 'preview';
const query = '/api/results/data?environment=' + environment + '&source=qa&campaign=' + campaign + '&q=Verification&area=Lengan%20Atas';
const data = await request(query, null, cookie); assert.equal(data.status, 200); const result = await data.json(); assert.equal(result.total, 1); assert.equal(result.rows[0].utm_content, 'integration-test'); assert.equal(result.rows[0].phone, '6281200000000');
const date = new Date(new Date(result.rows[0].created_at).getTime() + 7 * 3600000).toISOString().slice(0, 10);
const dated = await request(query + '&from=' + date + '&to=' + date, null, cookie); assert.equal((await dated.json()).total, 1);
const noMatch = await request(query + '&from=2000-01-01&to=2000-01-02', null, cookie); assert.equal((await noMatch.json()).total, 0);
const facets = await request('/api/results/facets?environment=' + environment, null, cookie); assert.equal(facets.status, 200); assert.ok((await facets.json()).campaigns.includes(campaign));
const unlocked = await request('/result', null, cookie); assert.equal(unlocked.status, 200); assert.match(await unlocked.text(), /id="filters"/);
const logout = await request('/api/results/logout', {}, cookie); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
console.log(JSON.stringify({ origin, direct, login: 'passed', privateAccess: 'protected', idempotentSave: 'passed', utmAndFilters: 'passed', mime: unlocked.headers.get('content-type'), csp: unlocked.headers.get('content-security-policy'), testRecord: id }));
