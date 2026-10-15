import { normalizeLeadMagnet } from './lead-magnet.mjs';
const asBool = value => value === true || String(value).toLowerCase() === 'true';
const parse = (value, fallback) => value ? JSON.parse(String(value)) : fallback;
const contactKey = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('8') ? '62' + digits : digits;
};
const identity = (name, contact) => String(name || '').trim().toLowerCase() + '|' + contactKey(contact);
function minute(value, sheetLocal = false) {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date((value - 25569) * 86400000 - 7 * 3600000) : new Date(sheetLocal && /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(String(value)) ? String(value).replace(' ', 'T') + '+07:00' : value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : '';
}
export function mapSheetSnapshot(snapshot) {
  const [headers, ...values] = snapshot.raw.values, [adminHeaders, ...adminValues] = snapshot.admin.values;
  const adminIndex = new Map();
  for (const [index, row] of adminValues.entries()) {
    const key = identity(row[1], row[2]) + '|' + minute(row[0], true);
    const record = { row: index + 2, fields: Object.fromEntries(adminHeaders.map((key, i) => [key, row[i] ?? null]).filter(([, value]) => value !== null && value !== '')) };
    if (!adminIndex.has(key)) adminIndex.set(key, []); adminIndex.get(key).push(record);
  }
  const leads = [], report = { sourceRows: values.length, imported: 0, skipped: [], ambiguousCrm: [], invalidContacts: [], errors: [] };
  const seen = new Set();
  for (const [index, cells] of values.entries()) {
    const rowNumber = index + 2, row = Object.fromEntries(headers.map((key, i) => [key, cells[i] ?? null]));
    if (row.source === 'codex-test' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.lead_id || '')) { report.skipped.push({ row: rowNumber, reason: 'test-or-missing-submission-id' }); continue; }
    if (seen.has(row.lead_id)) { report.skipped.push({ row: rowNumber, reason: 'duplicate-id' }); continue; }
    try {
      const result = parse(row.result_json, {}), journeyAnswers = parse(row.journey_answers_json, {});
      const serviceConsent = { granted: asBool(row.service_consent), timestamp: row.service_consent_at || null };
      const dataConsent = result.consent?.dataProcessing || { ...serviceConsent };
      const consultation = result.consent?.consultation || serviceConsent;
      const lead = normalizeLeadMagnet({ leadId: row.lead_id, capturedAt: row.captured_at || row.received_at, firstName: row.first_name, contact: row.contact, email: row.email, channel: row.channel, city: row.city, source: row.source, product: row.product, experienceVersion: row.experience_version, ageConfirmed: asBool(row.age_confirmed), serviceConsent: consultation, dataProcessingConsent: dataConsent, marketingConsent: { granted: asBool(row.marketing_consent), timestamp: row.marketing_consent_at || null }, consentVersion: result.consent?.version || 'combined-consent-v1', answers: parse(row.answers_json, []), journey: { answers: journeyAnswers }, result: { ...result, profile: result.profile || result.resultId || row.result_profile, readiness: result.readiness || row.result_readiness }, attribution: parse(row.attribution_json, {}), sourceContext: { origin: 'https://quiz.365mcindonesia.com' } }, { legacy: true });
      // Historical visit URLs were never recorded. Preserve that absence.
      lead.source_host = 'google-sheets-import'; lead.page_url = null; lead.referrer = null;
      lead.details.importedFrom = { spreadsheetId: snapshot.spreadsheetId, sheet: 'Sheet1', row: rowNumber, snapshotAt: snapshot.capturedAt, receivedAt: row.received_at };
      const matches = adminIndex.get(identity(row.first_name, row.contact) + '|' + minute(row.captured_at)) || [];
      if (matches.length === 1) lead.details.legacyCrm = matches[0].fields;
      else if (matches.length > 1) {
        lead.details.legacyCrmCandidates = matches; lead.details.dataQuality.push('Catatan Admin CRM pada menit yang sama perlu dicocokkan; kandidat disimpan tanpa memilih salah satunya.'); report.ambiguousCrm.push(rowNumber);
      } else lead.details.dataQuality.push('Catatan Admin CRM belum berhasil dicocokkan.');
      if (!lead.phone && lead.channel === 'whatsapp') report.invalidContacts.push(rowNumber);
      leads.push(lead); seen.add(lead.id);
    } catch (error) { report.errors.push({ row: rowNumber, reason: error.message }); }
  }
  report.imported = leads.length; return { leads, report };
}
