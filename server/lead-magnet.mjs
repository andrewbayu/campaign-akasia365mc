export const FORM_LABELS = { campaign: 'Promo LAMS', 'body-concern-check': 'Body Goal Check', 'body-journey-match': 'Body Journey Match', 'body-goal-navigator': 'Body Goal Navigator' };
export const QUIZ_ORIGINS = ['https://quiz.365mcindonesia.com', 'https://you-check-lm.vercel.app', 'https://you-check-lm-hiandrewbayu-2950s-projects.vercel.app'];
const versions = { 'body-concern-check': 'body-concern-check-v3', 'body-journey-match': 'body-journey-match-v2', 'body-goal-navigator': 'body-goal-navigator-v1' };
const areaLabels = { arms: 'Lengan', midsection: 'Perut & pinggang', thighs: 'Paha', jaw: 'Dagu & rahang', unsure: 'Belum yakin', face: 'Dagu dan garis rahang', upper: 'Lengan atau punggung', core: 'Perut atau sisi pinggang', lower: 'Paha atau area bawah bokong', whole: 'Beberapa area tubuh' };
const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
export class LeadValidationError extends Error {}
const invalid = message => { throw new LeadValidationError(message); };
function text(value, max = 256) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') invalid('Format data lead magnet tidak valid.');
  const result = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (result.length > max) invalid('Data lead magnet terlalu panjang.');
  return result || null;
}
function cleanJson(value, depth = 0) {
  if (depth > 8) invalid('Struktur detail terlalu dalam.');
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return text(value, 4000);
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) { if (value.length > 100) invalid('Terlalu banyak detail.'); return value.map(item => cleanJson(item, depth + 1)); }
  if (typeof value === 'object') {
    if (Object.keys(value).length > 60) invalid('Terlalu banyak detail.');
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)).map(([key, item]) => [text(key, 100), cleanJson(item, depth + 1)]));
  }
  invalid('Format detail tidak valid.');
}
export function normalizePhone(value) {
  let phone = String(value || '').replace(/[\s().+-]/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1); else if (phone.startsWith('8')) phone = '62' + phone;
  return /^[1-9]\d{8,14}$/.test(phone) ? phone : null;
}
export function normalizeLeadMagnet(body, { legacy = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Format lead magnet tidak valid.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.leadId || '')) invalid('ID submission tidak valid.');
  if (!versions[body.product] || versions[body.product] !== body.experienceVersion) invalid('Form lead magnet tidak didukung.');
  const origin = text(body.sourceContext?.origin, 256);
  if (!QUIZ_ORIGINS.includes(origin) && !/^https:\/\/you-check(?:-lm)?-[a-z0-9-]+-hiandrewbayu-2950s-projects\.vercel\.app$/.test(origin || '')) invalid('Sumber lead magnet tidak valid.');
  const name = text(body.firstName, 120), contact = text(body.contact, 160), channel = text(body.channel, 20);
  if (!name || !contact || !['whatsapp', 'email'].includes(channel)) invalid('Kontak lead magnet belum lengkap.');
  const email = text(channel === 'email' ? contact : body.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Email tidak valid.');
  const phone = channel === 'whatsapp' ? normalizePhone(contact) : null;
  if (channel === 'whatsapp' && !phone && !legacy) invalid('Nomor WhatsApp tidak valid.');
  const processing = body.dataProcessingConsent?.granted ?? body.serviceConsent?.granted;
  if (processing !== true) invalid('Persetujuan penggunaan data diperlukan.');
  const consultation = typeof body.serviceConsent?.granted === 'boolean' ? body.serviceConsent.granted : null;
  const captured = Date.parse(body.capturedAt);
  if (!Number.isFinite(captured) || captured < Date.parse('2000-01-01') || captured > Date.now() + 300000) invalid('Waktu submission tidak valid.');
  const selection = body.journey?.answers?.area ?? body.result?.concernArea;
  const areas = [...new Set((Array.isArray(selection) ? selection : selection ? [selection] : []).map(value => areaLabels[value] || text(value, 80)).filter(Boolean))];
  if (areas.length > 5) invalid('Terlalu banyak area.');
  if (!areas.length) areas.push('Belum ditentukan');
  const lead = { id: body.leadId, external_id: body.leadId, created_at: new Date(captured).toISOString(), name, phone, contact, channel, email, city: text(body.city, 80), area: areas.join(' · '), areas, source_form: body.product, consent: true, consultation_consent: consultation, marketing_consent: body.marketingConsent?.granted === true, privacy_version: text(body.consentVersion, 100) || 'combined-consent-v1', environment: QUIZ_ORIGINS.includes(origin) ? 'production' : 'preview', source_host: new URL(origin).host };
  for (const key of utmKeys) lead[key] = text(body.attribution?.[key]);
  let page;
  try { page = new URL(body.sourceContext?.pageUrl || origin); } catch { invalid('Alamat halaman tidak valid.'); }
  if (page.origin !== origin) invalid('Alamat halaman tidak valid.');
  const cleanPage = new URL(page.pathname, origin);
  for (const key of utmKeys) if (page.searchParams.has(key)) cleanPage.searchParams.set(key, text(page.searchParams.get(key)) || '');
  lead.page_url = cleanPage.toString().slice(0, 2048);
  try { const ref = new URL(body.sourceContext?.referrer); lead.referrer = /^https?:$/.test(ref.protocol) ? (ref.origin + ref.pathname).slice(0, 512) : null; } catch { lead.referrer = null; }
  lead.details = cleanJson({ experienceVersion: body.experienceVersion, source: body.source, answers: body.answers, journey: body.journey, result: body.result, planAssessment: body.planAssessment, ageConfirmed: body.ageConfirmed, contactPreference: body.contactPreference, serviceConsent: body.serviceConsent, dataProcessingConsent: body.dataProcessingConsent, marketingConsent: body.marketingConsent, attribution: body.attribution, selfReported: true, dataQuality: phone || channel === 'email' ? [] : ['Nomor WhatsApp perlu diperiksa'] });
  if (JSON.stringify(lead.details).length > 18000 || lead.area.length > 256) invalid('Detail lead magnet terlalu panjang.');
  return lead;
}
