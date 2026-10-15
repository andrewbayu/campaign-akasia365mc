const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function page(tracker, fails = false) {
  const events = [], opened = [], inserted = [], saved = [];
  const fields = {
    'lead-name': { value: 'QA Example' },
    'lead-phone': { value: '081200000000' },
    'form-area': { value: 'Lengan Atas' },
    'lead-consent': { checked: true }, 'lead-feedback': { textContent: '' }, 'lead-submit': {}, 'lead-website': { value: '' },
  };
  const sandbox = {
    document: {
      getElementById: id => fields[id],
      createElement: () => ({}),
      getElementsByTagName: () => [{ parentNode: { insertBefore: element => inserted.push(element) } }],
    },
    open: (url, target) => { const record = { url, target, closed: false }; opened.push(record); return { set opener(value) {}, get closed() { return record.closed; }, location: { set href(value) { record.url = value; } }, close() { record.closed = true; } }; },
    URL, crypto: webcrypto, AbortSignal,
    location: { href: 'https://campaign-akasia365mc.vercel.app/?utm_source=meta&utm_campaign=promo15', assign: url => opened.push({ url }) },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async (url, options) => { saved.push(JSON.parse(options.body)); return { ok: !fails, json: async () => fails ? { error: 'Gagal menyimpan' } : { ok: true } }; },
  };
  sandbox.window = sandbox;
  if (tracker === 'working') sandbox.fbq = (...args) => events.push(args);
  if (tracker === 'throwing') sandbox.fbq = () => { throw new Error('Tracker blocked'); };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'lead-capture.js'), 'utf8'), sandbox);
  vm.runInContext(scripts.at(-1), sandbox);
  return { sandbox, fields, events, opened, inserted, saved, submit: () => sandbox.handleLeadSubmit({ preventDefault() {} }) };
}

test('a page visit initializes the requested pixel and queues only PageView', () => {
  const { sandbox, inserted } = page();
  for (const script of scripts.filter(source => source.includes('connect.facebook.net'))) vm.runInContext(script, sandbox);
  const queue = Array.from(sandbox.fbq?.queue || [], args => Array.from(args));
  assert.deepEqual(queue, [
    ['set', 'autoConfig', false, '1294224382246215'],
    ['init', '1294224382246215'],
    ['track', 'PageView'],
  ]);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.equal(inserted[0].async, true);
});

test('a saved submission records one Lead without form data and opens the intended WhatsApp handoff', async () => {
  const p = page('working');
  await p.submit();
  assert.equal(p.saved.length, 1);
  assert.equal(p.saved[0].utm.utm_campaign, 'promo15');
  assert.deepEqual(p.events, [['track', 'Lead']]);
  assert.equal(p.opened.length, 1);
  const url = new URL(p.opened[0].url);
  assert.equal(url.origin + url.pathname, 'https://wa.me/628566365365');
  assert.equal(url.searchParams.get('text'), 'Halo Akasia 365mc Indonesia [Ad], saya ingin klaim promo Diskon 15% + Extra 2 Sesi Orange Care dan meminta jadwal konsultasi awal LAMS bersama Beauty Consultant. Mohon konfirmasi ketersediaan slot dan ketentuan promonya.');
});

test('repeated submissions reuse the ID and overlapping clicks cannot duplicate a save', async () => {
  const p = page('working');
  await Promise.all([p.submit(), p.submit()]);
  assert.equal(p.saved.length, 1);
  await p.submit();
  assert.equal(p.saved[0].id, p.saved[1].id);
  assert.equal(p.events.length, 1);
  assert.equal(p.opened.length, 2);
});

test('blank required fields produce neither a conversion nor a WhatsApp handoff', async () => {
  for (const id of ['lead-name', 'lead-phone']) {
    const p = page('working'); p.fields[id].value = ' ';
    await p.submit();
    assert.equal(p.events.length, 0);
    assert.equal(p.opened.length, 0);
  }
});

for (const tracker of [undefined, 'throwing']) {
  test(`WhatsApp still opens when the pixel is ${tracker || 'unavailable'}`, async () => {
    const p = page(tracker);
    await assert.doesNotReject(p.submit);
    assert.equal(p.opened.length, 1);
  });
}
test('failed persistence closes the pending window without a conversion and preserves form values', async () => {
  const p = page('working', true); await p.submit();
  assert.equal(p.events.length, 0); assert.equal(p.opened[0].closed, true);
  assert.equal(p.opened[0].url, 'about:blank'); assert.equal(p.fields['lead-name'].value, 'QA Example');
  assert.match(p.fields['lead-feedback'].textContent, /Gagal menyimpan/);
  assert.equal(p.fields['lead-submit'].disabled, false);
});
test('missing consent and invalid phone do not save or emit conversions', async () => {
  for (const change of [p => p.fields['lead-consent'].checked = false, p => p.fields['lead-phone'].value = 'abc']) {
    const p = page('working'); change(p); await p.submit();
    assert.equal(p.saved.length, 0); assert.equal(p.events.length, 0); assert.equal(p.opened.length, 0);
  }
});
