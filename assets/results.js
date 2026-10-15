(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const formLabels = { campaign: 'Promo LAMS', 'body-concern-check': 'Body Goal Check', 'body-journey-match': 'Body Journey Match', 'body-goal-navigator': 'Body Goal Navigator' };
  const questionLabels = { area: 'Area fokus', concern: 'Concern', effort: 'Yang sudah dicoba', importance: 'Seberapa berarti', timing: 'Kesiapan', goal: 'Tujuan', priority: 'Pertimbangan utama', pace: 'Langkah berikutnya' };
  const answerLabels = {
    area: { arms: 'Lengan', midsection: 'Perut & pinggang', thighs: 'Paha', jaw: 'Dagu & rahang', unsure: 'Belum yakin', face: 'Dagu dan garis rahang', upper: 'Lengan atau punggung', core: 'Perut atau sisi pinggang', lower: 'Paha atau area bawah bokong', whole: 'Beberapa area tubuh' },
    concern: { stubborn: 'Susah berubah meski sudah berusaha', shape: 'Bentuk / proporsi', firmness: 'Kurang kencang', confidence: 'Kenyamanan / percaya diri', unsure: 'Belum yakin' },
    effort: { nutrition: 'Mengatur pola makan', exercise: 'Olahraga rutin', alternative: 'Herbal / suplemen / alternatif', clinic: 'Konsultasi / perawatan klinik', not_fit: 'Belum menemukan cara yang cocok', starting: 'Baru mulai', tried: 'Sudah menjaga pola makan / aktif bergerak', changed: 'Berat / bentuk tubuh sudah berubah', researched: 'Sudah mencari informasi treatment' },
    importance: { low: 'Belum terlalu mengganggu', medium: 'Cukup mengganggu', high: 'Sangat mengganggu' },
    timing: { explore: 'Masih mencari tahu', planning: 'Dalam beberapa bulan', soon: 'Dalam waktu dekat' },
    goal: { contour: 'Kontur / proporsi', firmness: 'Kekencangan / kualitas kulit', confidence: 'Merasa lebih nyaman', process: 'Membandingkan pilihan dan proses' },
    priority: { safety: 'Keamanan dan assessment dokter', expectations: 'Hasil realistis dan batasannya', downtime: 'Proses dan recovery', privacy: 'Privasi dan kenyamanan' },
    pace: { explore: 'Pelajari dulu', planning: 'Tanya tim', ready: 'Konsultasi dengan dokter' },
  };
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401 && !path.endsWith('/login')) location.replace('/result'); throw new Error(data.error || 'Data gagal dimuat. Coba lagi.'); }
    return data;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if ($('login-form')) {
    $('login-form').addEventListener('submit', async event => {
      event.preventDefault(); const button = event.target.querySelector('button');
      button.disabled = true; button.textContent = 'Memeriksa…'; $('login-error').textContent = '';
      try { await post('/api/results/login', { password: $('password').value }); location.replace('/result'); }
      catch (error) { $('login-error').textContent = error.message || 'Tidak dapat masuk. Coba lagi.'; button.disabled = false; button.textContent = 'Masuk →'; }
    });
    return;
  }
  if (!$('filters')) return;
  let page = 1, limit = 25, serial = 0, controller;
  const filters = $('filters'), formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const parameters = () => { const query = new URLSearchParams(new FormData(filters)); for (const [key, value] of [...query]) if (!value) query.delete(key); query.set('page', String(page)); query.set('limit', String(limit)); return query; };
  const initial = new URLSearchParams(location.search);
  for (const field of filters.elements) if (field.name && initial.has(field.name)) field.value = initial.get(field.name);
  if ([25, 50, 100].includes(Number(initial.get('limit')))) limit = Number(initial.get('limit'));
  $('page-size').value = String(limit);
  function options(id, values, placeholder, selected) {
    const select = $(id); select.replaceChildren(new Option(placeholder, ''));
    for (const value of values) select.add(new Option(value ?? 'Tanpa UTM', value ?? '__none__'));
    if (selected && ![...select.options].some(option => option.value === selected)) select.add(new Option(selected === '__none__' ? 'Tanpa UTM' : selected, selected));
    select.value = selected || '';
  }
  function textCell(row, value, extra) {
    const cell = document.createElement('td'); cell.textContent = value || '—';
    if (extra) { const small = document.createElement('small'); small.textContent = extra; cell.append(small); }
    row.append(cell); return cell;
  }
  function detailPanel(lead) {
    const panel = document.createElement('section'); panel.className = 'lead-detail';
    const heading = document.createElement('h3'); heading.textContent = 'Detail submission'; panel.append(heading);
    const dl = document.createElement('dl'); panel.append(dl);
    const pair = (label, value) => {
      if (value === undefined || value === null || value === '') return;
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label;
      dd.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value); dl.append(dt, dd);
    };
    pair('ID', lead.id); pair('Asal form', formLabels[lead.source_form] || lead.source_form || 'Promo LAMS'); pair('Domain', lead.source_host); pair('Email', lead.email); pair('Kota', lead.city);
    pair('Izin konsultasi / follow-up', lead.consultation_consent === true ? 'Disetujui' : lead.consultation_consent === false ? 'Tidak disetujui — jangan hubungi untuk follow-up' : 'Belum tercatat — periksa dahulu');
    pair('Izin marketing', lead.marketing_consent ? 'Disetujui' : 'Tidak disetujui'); pair('Versi persetujuan', lead.privacy_version);
    const details = lead.details || {}, result = details.result || {};
    const consent = details.dataProcessingConsent || details.serviceConsent;
    const when = value => Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : String(value);
    if (consent?.timestamp) pair('Waktu persetujuan data (WIB)', when(consent.timestamp));
    if (details.serviceConsent?.timestamp) pair('Waktu izin follow-up (WIB)', when(details.serviceConsent.timestamp));
    pair('Versi kuis', details.experienceVersion);
    for (const [key, value] of Object.entries(details.journey?.answers || {})) {
      const values = Array.isArray(value) ? value : [value];
      pair(questionLabels[key] || key, values.map(item => answerLabels[key]?.[item] || item).join(' · '));
    }
    pair('Profil hasil kuis', result.profile || result.resultId); pair('Kesiapan', result.readiness); pair('Skor prioritas internal', result.leadScore); pair('Tingkat prioritas', result.leadTier); pair('Topik diskusi', Array.isArray(result.discussionTopics) ? result.discussionTopics.join(' · ') : null); pair('Assessment tambahan', details.planAssessment); pair('Preferensi kontak', details.contactPreference);
    for (const [key, value] of Object.entries(details.legacyCrm || {})) pair('CRM lama · ' + key, value);
    for (const candidate of details.legacyCrmCandidates || []) for (const [key, value] of Object.entries(candidate.fields || {})) pair('Kandidat CRM baris ' + candidate.row + ' · ' + key, value);
    for (const warning of details.dataQuality || []) pair('Perlu diperiksa', warning);
    const note = document.createElement('p'); note.textContent = 'Jawaban kuis adalah laporan mandiri, bukan diagnosis atau penentu kelayakan treatment. Catatan CRM lama merupakan salinan saat impor.'; panel.append(note);
    return panel;
  }
  async function load() {
    const current = ++serial; controller?.abort(); controller = new AbortController();
    $('data-status').textContent = 'Memuat data…'; $('results-error').textContent = '';
    $('previous').disabled = true; $('next').disabled = true; $('refresh').disabled = true;
    $('lead-rows').replaceChildren(); $('empty-state').hidden = true;
    const query = parameters(), source = $('source').value || initial.get('source') || '', campaign = $('campaign').value || initial.get('campaign') || '', area = $('area').value || initial.get('area') || '';
    if (source) query.set('source', source); if (campaign) query.set('campaign', campaign); if (area) query.set('area', area);
    initial.delete('source'); initial.delete('campaign'); initial.delete('area');
    try {
      const [data, facets] = await Promise.all([api('/api/results/data?' + query, { signal: controller.signal }), api('/api/results/facets?environment=' + encodeURIComponent($('environment').value), { signal: controller.signal })]);
      if (serial !== current) return;
      if (page > 1 && !data.rows.length && data.total) { page = Math.ceil(data.total / limit); return load(); }
      options('source', facets.sources, 'Semua sumber', source); options('campaign', facets.campaigns, 'Semua campaign', campaign);
      options('area', facets.areas || [], 'Semua area', area);
      $('total-count').textContent = new Intl.NumberFormat('id-ID').format(facets.total);
      $('filtered-count').textContent = new Intl.NumberFormat('id-ID').format(data.total);
      const fragment = document.createDocumentFragment();
      for (const lead of data.rows) {
        const row = document.createElement('tr');
        textCell(row, formatter.format(new Date(lead.created_at)), 'WIB'); textCell(row, lead.name, lead.details?.legacyCrm?.['FU Status']);
        const cell = textCell(row, lead.phone ? '+' + lead.phone : lead.contact || lead.email);
        if (lead.phone && lead.consultation_consent === true) {
          cell.replaceChildren(); const link = document.createElement('a'); link.textContent = '+' + lead.phone; link.href = 'https://wa.me/' + encodeURIComponent(lead.phone); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'phone-link'; cell.append(link);
        }
        if (lead.email && lead.email !== lead.contact) { const email = document.createElement('small'); email.textContent = lead.email; cell.append(email); }
        if (lead.consultation_consent !== true) { const warning = document.createElement('small'); warning.className = 'consent-note'; warning.textContent = lead.consultation_consent === false ? 'Tanpa izin follow-up' : 'Izin perlu diperiksa'; cell.append(warning); }
        textCell(row, formLabels[lead.source_form] || 'Promo LAMS'); textCell(row, lead.area); textCell(row, lead.utm_source || 'Tanpa UTM', lead.utm_medium); textCell(row, lead.utm_campaign); textCell(row, lead.utm_content); textCell(row, lead.utm_term, lead.utm_id ? 'ID: ' + lead.utm_id : '');
        const detailRow = document.createElement('tr'), detailCell = document.createElement('td'), buttonCell = document.createElement('td'), button = document.createElement('button');
        detailRow.hidden = true; detailRow.id = 'detail-' + lead.id; detailRow.className = 'detail-row'; detailCell.colSpan = 10; detailCell.append(detailPanel(lead)); detailRow.append(detailCell);
        button.type = 'button'; button.className = 'secondary detail-toggle'; button.textContent = 'Detail'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', detailRow.id); button.setAttribute('aria-label', 'Detail submission ' + lead.name);
        const toggle = () => { detailRow.hidden = !detailRow.hidden; button.setAttribute('aria-expanded', String(!detailRow.hidden)); button.textContent = detailRow.hidden ? 'Detail' : 'Tutup'; if (!detailRow.hidden) row.closest('.table-scroll').scrollLeft = 0; };
        const close = document.createElement('button'); close.type = 'button'; close.className = 'secondary'; close.textContent = 'Tutup detail'; close.addEventListener('click', toggle); detailCell.querySelector('section').append(close);
        button.addEventListener('click', toggle); buttonCell.append(button); row.append(buttonCell);
        fragment.append(row, detailRow);
      }
      $('lead-rows').replaceChildren(fragment); $('empty-state').hidden = data.rows.length !== 0;
      $('data-status').textContent = data.total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, data.total)} dari ${data.total}` : '0 submission';
      $('page-label').textContent = `Halaman ${page} / ${Math.max(1, Math.ceil(data.total / limit))}`;
      $('previous').disabled = page === 1; $('next').disabled = page * limit >= data.total;
      // Search contains personal information; never persist it in the browser URL.
      const shareable = new URLSearchParams(query); shareable.delete('q'); history.replaceState(null, '', '/result' + (shareable.size ? '?' + shareable : ''));
    } catch (error) {
      if (serial === current && error.name !== 'AbortError') { $('results-error').textContent = error.message || 'Data gagal dimuat.'; $('data-status').textContent = 'Gagal memuat data'; $('total-count').textContent = '—'; $('filtered-count').textContent = '—'; }
    } finally { if (serial === current) $('refresh').disabled = false; }
  }
  filters.addEventListener('submit', event => { event.preventDefault(); page = 1; load(); });
  filters.addEventListener('reset', () => { initial.delete('source'); initial.delete('campaign'); initial.delete('area'); setTimeout(() => { filters.elements.environment.value = 'production'; filters.elements.order.value = 'newest'; page = 1; load(); }, 0); });
  $('environment').addEventListener('change', () => { $('source').value = ''; $('campaign').value = ''; page = 1; load(); });
  $('refresh').addEventListener('click', load);
  $('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('next').addEventListener('click', () => { page++; load(); });
  $('page-size').addEventListener('change', () => { limit = Number($('page-size').value); page = 1; load(); });
  $('logout').addEventListener('click', async () => { try { await post('/api/results/logout', {}); location.replace('/result'); } catch (error) { $('results-error').textContent = error.message; } });
  $('utm-form').addEventListener('submit', event => {
    event.preventDefault(); const fields = new FormData(event.target), url = new URL(fields.get('destination') === 'quiz' ? 'https://quiz.365mcindonesia.com/' : 'https://campaign.365mcindonesia.com/');
    for (const [key, value] of fields) if (key !== 'destination' && value.trim()) url.searchParams.set(key, value.trim());
    $('utm-link').value = url.toString(); $('utm-output').hidden = false; $('copy-status').textContent = '';
  });
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('utm-link').value); $('copy-status').textContent = 'Tautan tersalin.'; }
    catch { $('utm-link').select(); $('copy-status').textContent = 'Pilih dan salin tautan di atas.'; }
  });
  load();
})();
