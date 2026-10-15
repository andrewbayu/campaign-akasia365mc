import { loginPage, resultsPage } from './views.mjs';

export const AREAS = ['Perut Bawah', 'Lengan Atas', 'Paha (Dalam/Luar)', 'Pinggang / Flank'];
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
const COOKIE = '__Host-akasia_results', SESSION_SECONDS = 28800;
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const equal = (a, b) => { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; };
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const invalid = message => { throw new HttpError(400, message); };

async function derivePassword(password, salt, crypto) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, key, 256));
}
export async function hashPassword(password, crypto = globalThis.crypto) {
  const salt = crypto.getRandomValues(new Uint8Array(24));
  return { password_salt: b64(salt), password_hash: b64(await derivePassword(password, salt, crypto)) };
}
export async function verifyPassword(password, record, crypto = globalThis.crypto) {
  if (typeof password !== 'string' || password.length > 256) return false;
  try { return equal(await derivePassword(password, unb64(record.password_salt), crypto), unb64(record.password_hash)); }
  catch { return false; }
}
async function sign(value, secret, crypto) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
export async function createSession(secret, host, now = Date.now(), crypto = globalThis.crypto) {
  const payload = b64(encoder.encode(JSON.stringify({ aud: host, exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() })));
  return payload + '.' + b64(await sign(payload, secret, crypto));
}
export async function verifySession(token, secret, host, now = Date.now(), crypto = globalThis.crypto) {
  try {
    if (!token || token.length > 1024) return false;
    const parts = token.split('.');
    if (parts.length !== 2 || !equal(await sign(parts[0], secret, crypto), unb64(parts[1]))) return false;
    const data = JSON.parse(new TextDecoder().decode(unb64(parts[0]))), seconds = Math.floor(now / 1000);
    return data.aud === host && Number.isInteger(data.exp) && data.exp > seconds && data.exp <= seconds + SESSION_SECONDS;
  } catch { return false; }
}
export function isAllowedOrigin(origin, allowLocal = false) {
  return ['https://campaign-akasia365mc.vercel.app', 'https://akasia.netlify.app'].includes(origin)
    || /^https:\/\/campaign-akasia365mc-[a-z0-9-]+-hiandrewbayu-2950s-projects\.vercel\.app$/.test(origin)
    || /^https:\/\/deploy-preview-\d+--akasia\.netlify\.app$/.test(origin)
    || (allowLocal && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
}
function field(value, max, required = false) {
  if (value === undefined || value === null) { if (required) invalid('Lengkapi data yang diperlukan.'); return null; }
  if (typeof value !== 'string') invalid('Format data tidak valid.');
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (cleaned.length > max || (required && !cleaned)) invalid('Panjang data tidak valid.');
  return cleaned || null;
}
export function normalizeLead(body, origin) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Format data tidak valid.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id || '')) invalid('ID permintaan tidak valid.');
  const name = field(body.name, 120, true), rawPhone = field(body.phone, 32, true).replace(/[\s().-]/g, '');
  let phone = rawPhone.replace(/^\+/, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  else if (phone.startsWith('8')) phone = '62' + phone;
  if (!/^628\d{7,12}$/.test(phone) || phone.length > 15) invalid('Periksa nomor WhatsApp kamu.');
  if (!AREAS.includes(body.area)) invalid('Pilih area yang tersedia.');
  if (body.consent !== true) invalid('Persetujuan penggunaan data diperlukan.');
  const lead = { id: body.id, name, phone, area: body.area, consent: true, privacy_version: '2026-10-15', source_host: new URL(origin).host, environment: ['https://campaign-akasia365mc.vercel.app', 'https://akasia.netlify.app'].includes(origin) ? 'production' : 'preview' };
  for (const key of UTM_KEYS) lead[key] = field(body.utm?.[key], 256);
  let page;
  try { page = new URL(body.page_url || origin); } catch { invalid('Alamat halaman tidak valid.'); }
  if (page.origin !== origin) invalid('Alamat halaman tidak valid.');
  const clean = new URL(page.pathname, origin);
  for (const key of UTM_KEYS) if (page.searchParams.has(key)) clean.searchParams.set(key, field(page.searchParams.get(key), 256) || '');
  lead.page_url = clean.toString().slice(0, 2048);
  if (body.referrer) {
    try { const url = new URL(body.referrer); lead.referrer = /^https?:$/.test(url.protocol) ? (url.origin + url.pathname).slice(0, 512) : null; }
    catch { lead.referrer = null; }
  } else lead.referrer = null;
  return lead;
}
function day(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) invalid('Tanggal tidak valid.');
  return Date.parse(text + 'T00:00:00+07:00');
}
export function parseFilters(params) {
  const from = params.get('from'), to = params.get('to');
  const after = from ? day(from) : null, before = to ? day(to) + 86400000 : null;
  if (after !== null && before !== null && after >= before) invalid('Tanggal awal harus sebelum tanggal akhir.');
  const area = params.get('area') || null;
  if (area && !AREAS.includes(area)) invalid('Filter area tidak valid.');
  const page = Number(params.get('page') || 1), limit = Number(params.get('limit') || 25);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || ![25, 50, 100].includes(limit)) invalid('Halaman tidak valid.');
  const environment = params.get('environment') || 'production';
  if (!['production', 'preview'].includes(environment)) invalid('Filter data tidak valid.');
  return { after: after === null ? null : new Date(after).toISOString(), before: before === null ? null : new Date(before).toISOString(), area, source: field(params.get('source'), 256), campaign: field(params.get('campaign'), 256), q: (field(params.get('q'), 120) || '').replace(/[^\p{L}\p{N}+\s-]/gu, ''), environment, order: params.get('order') === 'oldest' ? 'asc' : 'desc', offset: (page - 1) * limit, limit, page };
}
export const SECURITY_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0', 'Vercel-CDN-Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const headers = SECURITY_HEADERS;
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const html = content => new Response(content, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
async function readJson(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw new HttpError(415, 'Format permintaan tidak didukung.');
  const text = await request.text();
  if (encoder.encode(text).length > 12288) throw new HttpError(413, 'Permintaan terlalu besar.');
  try { return JSON.parse(text); } catch { invalid('Format permintaan tidak valid.'); }
}
export function createHandler({ store, now = Date.now, crypto = globalThis.crypto, allowLocal = false }) {
  return async request => {
    const url = new URL(request.url), route = (request.headers.get('x-campaign-route') || url.pathname).replace(/\/$/, '');
    try {
      if (!['/api/leads', '/result', '/api/results/login', '/api/results/logout', '/api/results/data', '/api/results/facets'].includes(route)) throw new HttpError(404, 'Halaman tidak ditemukan.');
      const host = request.headers.get('x-campaign-host') || url.host;
      const origin = (allowLocal && /^(localhost|127\.0\.0\.1):/.test(host) ? 'http://' : 'https://') + host;
      if (!isAllowedOrigin(origin, allowLocal)) throw new HttpError(403, 'Permintaan tidak diizinkan.');
      const post = ['/api/leads', '/api/results/login', '/api/results/logout'].includes(route);
      if (request.method !== (post ? 'POST' : 'GET')) return json({ error: 'Metode tidak didukung.' }, 405, { Allow: post ? 'POST' : 'GET' });
      if (post && request.headers.get('origin') !== origin) throw new HttpError(403, 'Permintaan tidak diizinkan.');
      const config = await store.getConfig();
      if (!config?.password_hash || !config?.session_secret) throw new Error('Configuration unavailable');
      const ipKey = b64(await sign(request.headers.get('x-campaign-ip') || 'unknown', config.session_secret, crypto));
      const cookie = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
      const authenticated = await verifySession(cookie, config.session_secret, host, now(), crypto);
      const cookieHeader = (token, seconds) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
      if (route === '/api/leads') {
        const body = await readJson(request);
        if (body.website) return json({ ok: true });
        const lead = normalizeLead(body, origin);
        if (!await store.consumeLimit('submit:' + ipKey, 20, 600)) throw new HttpError(429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        await store.insertLead(lead);
        return json({ ok: true });
      }
      if (route === '/api/results/login') {
        const body = await readJson(request);
        if (!await store.consumeLimit('login:' + ipKey, 5, 900) || !await store.consumeLimit('login:global', 60, 900)) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
        if (!await verifyPassword(body.password, config, crypto)) throw new HttpError(401, 'Password tidak sesuai.');
        return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(await createSession(config.session_secret, host, now(), crypto), SESSION_SECONDS) });
      }
      if (route === '/api/results/logout') return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', 0) });
      if (route === '/result') return html(authenticated ? resultsPage() : loginPage());
      if (!authenticated) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
      const filters = parseFilters(url.searchParams);
      return json(route === '/api/results/facets' ? await store.getFacets(filters.environment) : await store.listLeads(filters));
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('campaign_request_failed', { route, status: 503 });
      return json({ error: 'Layanan belum tersedia. Silakan coba lagi.' }, 503);
    }
  };
}
