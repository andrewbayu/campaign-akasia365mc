import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, hashProxyKey, parseFilters } from '../server/core.mjs';
const payload = { leadId: 'cfd38e7c-68ad-4b33-8810-d3824c86daf1', capturedAt: '2026-10-15T03:00:00Z', source: 'the-you-check-in', product: 'body-concern-check', experienceVersion: 'body-concern-check-v3', firstName: 'QA Example', contact: '081200000000', email: 'qa@example.com', channel: 'whatsapp', city: '', ageConfirmed: true, serviceConsent: { granted: false, timestamp: null }, dataProcessingConsent: { granted: true, timestamp: '2026-10-15T03:00:00Z' }, marketingConsent: { granted: false, timestamp: null }, consentVersion: 'separate-consent-v1', answers: [['arms', 'midsection'], ['stubborn'], ['exercise'], ['high'], ['soon']], journey: { answers: { area: ['arms', 'midsection'], concern: ['stubborn'], effort: ['exercise'], importance: ['high'], timing: ['soon'] } }, result: { profile: 'ready-to-discuss', readiness: 'Siap membahasnya', leadScore: 80, leadTier: 'high' }, attribution: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'checkin', utm_id: '123' }, sourceContext: { origin: 'https://quiz.365mcindonesia.com', pageUrl: 'https://quiz.365mcindonesia.com/?utm_source=meta&email=private', referrer: 'https://example.com/?email=private', clientIp: '203.0.113.1' } };
async function fixture() {
  const rows = new Map(), buckets = new Map();
  const store = { getConfig: async () => ({ password_hash: 'unused', session_secret: 'test-only-session-secret', proxy_key_hash: await hashProxyKey('proxy-test'), lead_magnet_key_hash: await hashProxyKey('ingest-test') }), consumeLimit: async (key, max) => { const count = (buckets.get(key) || 0) + 1; buckets.set(key, count); return count <= max; }, insertLead: async row => { if (!rows.has(row.id)) rows.set(row.id, row); } };
  const handler = createHandler({ store });
  const request = (body = payload, key = 'ingest-test') => new Request('https://example.supabase.co/functions/v1/akasia-campaign/lead-magnet', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-akasia-ingest-key': key } : {}) }, body: JSON.stringify(body) });
  return { handler, request, rows };
}
test('authenticated lead magnet ingestion preserves its distinct data, consent and UTM without granting dashboard access', async () => {
  const p = await fixture();
  const response = await p.handler(p.request()); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const row = [...p.rows.values()][0];
  assert.equal(row.source_form, 'body-concern-check'); assert.equal(row.phone, '6281200000000'); assert.equal(row.email, 'qa@example.com');
  assert.deepEqual(row.areas, ['Lengan', 'Perut & pinggang']); assert.equal(row.consultation_consent, false); assert.equal(row.consent, true);
  assert.equal(row.utm_campaign, 'checkin'); assert.equal(row.utm_id, '123'); assert.equal(row.details.result.profile, 'ready-to-discuss');
  assert.equal(new URL(row.page_url).searchParams.has('email'), false); assert.equal(row.referrer, 'https://example.com/');
  assert.equal(row.details.sourceContext, undefined);
  const denied = await p.handler(new Request('https://campaign.365mcindonesia.com/api/results/data', { headers: { 'x-akasia-ingest-key': 'ingest-test' } })); assert.equal(denied.status, 403);
});
test('ingestion rejects missing/wrong credentials, absent data consent and an unknown source host', async () => {
  const p = await fixture();
  for (const key of [null, 'wrong']) assert.equal((await p.handler(p.request(payload, key))).status, 403);
  assert.equal((await p.handler(p.request({ ...payload, dataProcessingConsent: { granted: false } }))).status, 400);
  assert.equal((await p.handler(p.request({ ...payload, sourceContext: { origin: 'https://unrelated.example' } }))).status, 400);
  assert.equal(p.rows.size, 0);
});
test('replayed lead magnet submissions remain one row and retain their original ID', async () => {
  const p = await fixture(); for (let i = 0; i < 2; i++) assert.equal((await p.handler(p.request())).status, 200);
  assert.equal(p.rows.size, 1); assert.equal([...p.rows.keys()][0], payload.leadId);
});
test('shared dashboard filters accept lead-magnet areas, form source and consultation consent', () => {
  const f = parseFilters(new URLSearchParams('area=Dagu+%26+rahang&form=body-concern-check&consultation=no'));
  assert.equal(f.area, 'Dagu & rahang'); assert.equal(f.form, 'body-concern-check'); assert.equal(f.consultation, 'no');
});
