const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function page(tracker) {
  const events = [], opened = [], inserted = [];
  const fields = {
    'lead-name': { value: 'QA Example' },
    'lead-phone': { value: '081200000000' },
    'form-area': { value: 'Lengan Atas' },
  };
  const sandbox = {
    document: {
      getElementById: id => fields[id],
      createElement: () => ({}),
      getElementsByTagName: () => [{ parentNode: { insertBefore: element => inserted.push(element) } }],
    },
    open: (url, target) => opened.push({ url, target }),
  };
  sandbox.window = sandbox;
  if (tracker === 'working') sandbox.fbq = (...args) => events.push(args);
  if (tracker === 'throwing') sandbox.fbq = () => { throw new Error('Tracker blocked'); };
  vm.createContext(sandbox);
  vm.runInContext(scripts.at(-1), sandbox);
  return { sandbox, fields, events, opened, inserted, submit: () => sandbox.handleLeadSubmit({ preventDefault() {} }) };
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

test('a valid submission records one Lead without form data and opens the intended WhatsApp handoff', () => {
  const p = page('working');
  p.submit();
  assert.deepEqual(p.events, [['track', 'Lead']]);
  assert.equal(p.opened.length, 1);
  const url = new URL(p.opened[0].url);
  assert.equal(url.origin + url.pathname, 'https://wa.me/6281119017365');
  assert.ok(url.searchParams.get('text').includes('QA Example'));
  assert.ok(url.searchParams.get('text').includes('Lengan Atas'));
});

test('repeated form submissions do not count the same visitor as multiple leads', () => {
  const p = page('working');
  p.submit(); p.submit();
  assert.equal(p.events.length, 1);
  assert.equal(p.opened.length, 2);
});

test('blank required fields produce neither a conversion nor a WhatsApp handoff', () => {
  for (const id of ['lead-name', 'lead-phone']) {
    const p = page('working'); p.fields[id].value = ' ';
    p.submit();
    assert.equal(p.events.length, 0);
    assert.equal(p.opened.length, 0);
  }
});

for (const tracker of [undefined, 'throwing']) {
  test(`WhatsApp still opens when the pixel is ${tracker || 'unavailable'}`, () => {
    const p = page(tracker);
    assert.doesNotThrow(p.submit);
    assert.equal(p.opened.length, 1);
  });
}
