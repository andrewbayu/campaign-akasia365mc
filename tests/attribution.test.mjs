import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const script = await readFile(new URL('../assets/lead-capture.js', import.meta.url), 'utf8');
const fields = { name: 'QA', phone: '081200000000', area: 'Perut Bawah', consent: true };
function page(href, storage, fail = false) {
  const requests = [];
  const context = { URL, crypto: webcrypto, AbortSignal, location: { href }, document: { referrer: '' }, sessionStorage: storage, fetch: async (_, options) => { requests.push(JSON.parse(options.body)); return { ok: !fail, json: async () => ({ ok: !fail }) }; } };
  context.window = context; vm.runInNewContext(script, context); return { requests, submit: () => context.akasiaLeadCapture.submit(fields) };
}
test('attribution persists within a tab, a new tagged arrival replaces old campaign fields, and unrelated queries are excluded', async () => {
  let saved; const storage = { getItem: () => saved, setItem: (_, value) => saved = value };
  const first = page('https://akasia.netlify.app/?utm_source=meta&utm_campaign=promo15&utm_content=old&email=private', storage); await first.submit();
  assert.equal(new URL(first.requests[0].page_url).searchParams.has('email'), false);
  const direct = page('https://akasia.netlify.app/', storage); await direct.submit(); assert.equal(direct.requests[0].utm.utm_campaign, 'promo15');
  const next = page('https://akasia.netlify.app/?utm_source=google', storage); await next.submit();
  assert.deepEqual(next.requests[0].utm, { utm_source: 'google' });
});
test('blocked storage still captures URL attribution and retries preserve the submission ID', async () => {
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  const p = page('https://akasia.netlify.app/?utm_source=meta', blocked, true);
  await assert.rejects(p.submit); await assert.rejects(p.submit);
  assert.equal(p.requests[0].utm.utm_source, 'meta'); assert.equal(p.requests[0].id, p.requests[1].id);
});
test('the public build cannot include credentials, private source or tests', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../dist/', import.meta.url));
  for (const forbidden of ['.local', '.git', 'server', 'backend', 'database', 'tests', 'scripts', 'docs']) assert.equal(files.includes(forbidden), false);
});
