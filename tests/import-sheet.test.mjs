import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSheetSnapshot } from '../server/import-sheet.mjs';
const headers = ['captured_at','received_at','lead_id','source','product','experience_version','first_name','email','channel','contact','city','age_confirmed','service_consent','marketing_consent','service_consent_at','answers_json','journey_answers_json','result_json','attribution_json'];
const row = (id, name, contact, date) => [date,date,id,'the-you-check-in','body-concern-check','body-concern-check-v3',name,null,'whatsapp',contact,null,true,true,false,date,'[["arms"]]','{"area":["arms"]}','{"profile":"start-with-clarity"}','{}'];
const first = 'cfd38e7c-68ad-4b33-8810-d3824c86daf1', second = 'bb98db72-ad01-4f8f-9aeb-1a10b9824980';
test('historical import matches reversed CRM rows by identity/time and preserves missing UTM, bad contact, timestamps and original IDs', () => {
  const snapshot = { spreadsheetId: 'test', capturedAt: '2026-10-15T03:00:00Z', raw: { values: [headers,row(first,'QA One','081200000000','2026-08-05T07:55:01Z'),row(second,'QA Two','unknown','2026-08-05T08:55:01Z'),row('bad','Test','0812','2026-08-05T08:00:00Z')] }, admin: { values: [['Date Created','Nama','WhatsApp No.','Email','City','Consent','Priority','Discussion Topics','FU Status'],['2026-08-05 15:55','QA Two','unknown',null,null,'Call',null,null,'Belum di-FU'],['2026-08-05 14:55','QA One','+6281200000000',null,null,'Call',null,null,'Sudah di-FU']] } };
  const { leads, report } = mapSheetSnapshot(snapshot);
  assert.equal(leads.length, 2); assert.equal(report.skipped.length, 1); assert.equal(report.errors.length, 0);
  assert.equal(leads[0].id, first); assert.equal(leads[0].created_at, '2026-08-05T07:55:01.000Z'); assert.equal(leads[0].details.legacyCrm['FU Status'], 'Sudah di-FU');
  assert.equal(leads[0].utm_source, null); assert.equal(leads[0].page_url, null); assert.equal(leads[1].phone, null); assert.equal(leads[1].contact, 'unknown'); assert.deepEqual(report.invalidContacts, [3]);
  assert.equal(leads[0].details.legacyCrm['WhatsApp No.'], '+6281200000000');
  snapshot.admin.values[2][3] = 'corrected@example.com'; snapshot.admin.values[2][4] = 'Jakarta';
  const updated = mapSheetSnapshot(snapshot).leads[0];
  assert.equal(updated.details.legacyCrm.Email, 'corrected@example.com'); assert.equal(updated.details.legacyCrm.City, 'Jakarta');
});
test('ambiguous CRM matches preserve all candidates without assigning one to a submission', () => {
  const snapshot = { spreadsheetId: 'test', raw: { values: [headers,row(first,'QA','081200000000','2026-08-05T07:55:01Z')] }, admin: { values: [['Date Created','Nama','WhatsApp No.'],['2026-08-05 14:55','QA','+6281200000000'],['2026-08-05 14:55','QA','+6281200000000']] } };
  const { leads, report } = mapSheetSnapshot(snapshot); assert.equal(leads[0].details.legacyCrm, undefined); assert.equal(leads[0].details.legacyCrmCandidates.length, 2); assert.deepEqual(report.ambiguousCrm, [2]);
});
