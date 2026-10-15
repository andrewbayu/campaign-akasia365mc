import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createHandler, AREAS } from '../server/core.mjs';
const config = { ...JSON.parse(await readFile('.local/password-record.json', 'utf8')), session_secret: randomBytes(32).toString('hex') };
const rows = Array.from({ length: 31 }, (_, i) => ({ id: randomUUID(), created_at: new Date(Date.parse('2026-10-15T03:00:00Z') - i * 86400000).toISOString(), name: i ? 'QA Example ' + i : '<img src=x onerror=alert(1)>', phone: '6281200000000', area: AREAS[i % 4], environment: 'production', utm_source: i % 2 ? 'meta' : 'google', utm_medium: 'paid_social', utm_campaign: i % 2 ? 'promo15' : 'orange-care', utm_content: 'QA only', utm_term: null, utm_id: 'QA' }));
const store = {
  getConfig: async () => config, consumeLimit: async () => true,
  insertLead: async lead => { if (!rows.some(row => row.id === lead.id)) rows.push({ ...lead, created_at: new Date().toISOString() }); },
  getFacets: async environment => { const found = rows.filter(row => row.environment === environment); return { total: found.length, sources: [...new Set(found.map(row => row.utm_source))], campaigns: [...new Set(found.map(row => row.utm_campaign))], forms: [...new Set(found.map(row => row.source_form))], areas: [...new Set(found.flatMap(row => row.areas))] }; },
  listLeads: async f => {
    const found = rows.filter(r => r.environment === f.environment && (!f.area || r.areas.includes(f.area)) && (!f.form || r.source_form === f.form) && (!f.consultation || (f.consultation === 'unknown' ? r.consultation_consent === null : r.consultation_consent === (f.consultation === 'yes'))) && (!f.source || r.utm_source === (f.source === '__none__' ? null : f.source)) && (!f.campaign || r.utm_campaign === (f.campaign === '__none__' ? null : f.campaign)) && (!f.after || r.created_at >= f.after) && (!f.before || r.created_at < f.before) && (!f.q || (r.name + r.phone + (r.email || '')).toLowerCase().includes(f.q.toLowerCase()))).sort((a, b) => a.created_at.localeCompare(b.created_at) * (f.order === 'asc' ? 1 : -1));
    return { rows: found.slice(f.offset, f.offset + f.limit), total: found.length, page: f.page, limit: f.limit };
  },
};
const handler = createHandler({ store, allowLocal: true, requireProxy: false });
for (const row of rows) Object.assign(row, { source_form: 'campaign', consultation_consent: true, channel: 'whatsapp', contact: row.phone, areas: [row.area] });
Object.assign(rows[1], { source_form: 'body-concern-check', area: 'Lengan · Perut & pinggang', areas: ['Lengan', 'Perut & pinggang'], email: 'qa@example.com', consultation_consent: false, marketing_consent: false, privacy_version: 'separate-consent-v1', details: { experienceVersion: 'body-concern-check-v3', journey: { answers: { area: ['arms','midsection'], concern: ['stubborn'], effort: ['exercise'], importance: ['high'], timing: ['soon'] } }, result: { profile: 'ready-to-discuss', leadScore: 80, leadTier: 'high' }, legacyCrm: { 'FU Status': 'Belum di-FU' } } });
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:48655');
    if (url.pathname.startsWith('/api/') || /^\/result\/?$/.test(url.pathname)) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const response = await handler(new Request(url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const target = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(root + '\\') || !(await stat(target)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }); res.end(await readFile(target));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(48655, '127.0.0.1', () => console.log('Local review: http://localhost:48655/result — synthetic rows only.'));
